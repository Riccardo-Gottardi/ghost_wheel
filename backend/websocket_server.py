import asyncio
import websockets
import json
import time
from typing import Set, Dict, Any

import websockets.exceptions
import websockets.server

class WebSocketServer:
    """Optimized WebSocket server for hand tracking data"""
    
    def __init__(self, host='localhost', port=8765):
        self.host = host
        self.port = port
        self.server = None
        self.clients: Set[Any] = set()  # WebSocket connections
        
        # Performance monitoring
        self.messages_sent = 0
        self.start_time = time.time()
        self.last_stats_time = time.time()
        
        # Rate limiting to prevent overwhelming clients
        self.max_fps = 60  # Maximum messages per second per client
        self.min_interval = 1.0 / self.max_fps
        self.last_broadcast_time = 0
        
    async def register_client(self, websocket):
        """Register a new client connection"""
        self.clients.add(websocket)
        client_count = len(self.clients)
        print(f"Client connected. Total clients: {client_count}")
        
        # Send welcome message with server info
        welcome_msg = {
            'type': 'connection',
            'status': 'connected',
            'server_info': {
                'max_fps': self.max_fps,
                'version': '2.0-optimized'
            }
        }
        
        try:
            await websocket.send(json.dumps(welcome_msg))
        except websockets.exceptions.ConnectionClosed:
            pass
            
    async def unregister_client(self, websocket):
        """Unregister a client connection"""
        self.clients.discard(websocket)
        client_count = len(self.clients)
        print(f"Client disconnected. Total clients: {client_count}")
        
    async def handle_client(self, websocket, path):
        """Handle individual client connections"""
        await self.register_client(websocket)
        
        try:
            # Keep connection alive and handle incoming messages
            async for message in websocket:
                try:
                    data = json.loads(message)
                    await self.handle_client_message(websocket, data)
                except json.JSONDecodeError:
                    print(f"Invalid JSON received from client")
                except Exception as e:
                    print(f"Error handling client message: {e}")
                    
        except websockets.exceptions.ConnectionClosed:
            pass
        except Exception as e:
            print(f"Error in client handler: {e}")
        finally:
            await self.unregister_client(websocket)
            
    async def handle_client_message(self, websocket, data: Dict[str, Any]):
        """Handle messages from clients"""
        message_type = data.get('type', 'unknown')
        
        if message_type == 'ping':
            # Respond to ping with pong
            pong_response = {
                'type': 'pong',
                'timestamp': int(time.time() * 1000)
            }
            await websocket.send(json.dumps(pong_response))
            
        elif message_type == 'get_stats':
            # Send server statistics
            stats = self.get_server_stats()
            await websocket.send(json.dumps(stats))
            
        elif message_type == 'config':
            # Handle configuration requests
            print(f"Configuration request: {data}")
            
    async def broadcast(self, hand_data: Dict[str, Any]):
        """High-performance broadcast with minimal overhead"""
        if not self.clients:
            return
            
        current_time = time.time()
        
        # Aggressive rate limiting for maximum performance
        if current_time - self.last_broadcast_time < self.min_interval:
            return
            
        self.last_broadcast_time = current_time
        
        # Prepare message (minimal overhead)
        message = {
            'type': 'hand_data',
            'data': hand_data
        }
        
        # Convert to JSON once for all clients (optimization)
        try:
            json_message = json.dumps(message)
        except Exception:
            return  # Skip this frame if JSON encoding fails
        
        # Fast broadcast to all clients
        if self.clients:
            disconnected_clients = []
            
            for client in self.clients:
                try:
                    # Non-blocking send (fire and forget for max speed)
                    asyncio.create_task(client.send(json_message))
                except websockets.exceptions.ConnectionClosed:
                    disconnected_clients.append(client)
                except Exception:
                    disconnected_clients.append(client)
            
            # Remove disconnected clients (fast cleanup)
            for client in disconnected_clients:
                self.clients.discard(client)
                
            self.messages_sent += 1
                
    async def send_to_client(self, client, message: str, disconnected_clients: set):
        """Send message to a specific client with error handling"""
        try:
            await client.send(message)
        except websockets.exceptions.ConnectionClosed:
            disconnected_clients.add(client)
        except Exception as e:
            print(f"Error sending to client: {e}")
            disconnected_clients.add(client)
            
    def get_server_stats(self) -> Dict[str, Any]:
        """Get server performance statistics"""
        current_time = time.time()
        uptime = current_time - self.start_time
        avg_messages_per_sec = self.messages_sent / uptime if uptime > 0 else 0
        
        return {
            'type': 'server_stats',
            'stats': {
                'connected_clients': len(self.clients),
                'messages_sent': self.messages_sent,
                'uptime_seconds': round(uptime, 2),
                'avg_messages_per_second': round(avg_messages_per_sec, 2),
                'max_fps': self.max_fps,
                'server_address': f"ws://{self.host}:{self.port}"
            }
        }
        
    def print_performance_stats(self):
        """Print performance statistics to console"""
        stats = self.get_server_stats()['stats']
        print(f"WebSocket Server Stats: "
              f"Clients: {stats['connected_clients']}, "
              f"Messages: {stats['messages_sent']}, "
              f"Avg FPS: {stats['avg_messages_per_second']:.1f}")
        
    async def start(self):
        """Start the WebSocket server"""
        try:
            self.server = await websockets.server.serve(
                self.handle_client,
                self.host,
                self.port,
                ping_interval=20,  # Send ping every 20 seconds
                ping_timeout=10,   # Wait 10 seconds for pong
                max_size=1024 * 64,  # 64KB max message size
                compression=None   # Disable compression for lower latency
            )
            
            print(f"WebSocket server started on ws://{self.host}:{self.port}")
            print(f"Server optimized for max {self.max_fps} FPS")
            
        except Exception as e:
            print(f"Error starting WebSocket server: {e}")
            raise
            
    async def stop(self):
        """Stop the WebSocket server"""
        if self.server:
            print("Stopping WebSocket server...")
            
            # Close all client connections
            if self.clients:
                close_tasks = [client.close() for client in self.clients]
                await asyncio.gather(*close_tasks, return_exceptions=True)
                self.clients.clear()
                
            # Close server
            self.server.close()
            await self.server.wait_closed()
            
            # Print final stats
            final_stats = self.get_server_stats()['stats']
            print(f"WebSocket server stopped. Final stats:")
            print(f"  Total messages sent: {final_stats['messages_sent']}")
            print(f"  Uptime: {final_stats['uptime_seconds']:.1f} seconds")
            print(f"  Average FPS: {final_stats['avg_messages_per_second']:.1f}")
            
    async def health_check(self):
        """Perform health check on server and clients"""
        healthy_clients = 0
        unhealthy_clients = []
        
        for client in self.clients.copy():
            try:
                pong_waiter = await client.ping()
                await asyncio.wait_for(pong_waiter, timeout=5.0)
                healthy_clients += 1
            except (websockets.exceptions.ConnectionClosed, asyncio.TimeoutError):
                unhealthy_clients.append(client)
            except Exception as e:
                print(f"Unexpected error in health check: {e}")
                unhealthy_clients.append(client)
                
        # Remove unhealthy clients
        for client in unhealthy_clients:
            self.clients.discard(client)
            
        return {
            'healthy_clients': healthy_clients,
            'removed_clients': len(unhealthy_clients),
            'total_clients': len(self.clients)
        }