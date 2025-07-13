import asyncio
import websockets
import websockets.server
from websockets.exceptions import ConnectionClosed, WebSocketException
import json
import logging

class WebSocketServer:
    def __init__(self, host='localhost', port=8765):
        self.host = host
        self.port = port
        self.clients = set()
        self.server = None
        
        # Configure logging for better debugging
        logging.basicConfig(level=logging.INFO)
        self.logger = logging.getLogger(__name__)
        
    async def register_client(self, websocket, path):
        """Register a new client"""
        self.clients.add(websocket)
        client_info = f"{websocket.remote_address[0]}:{websocket.remote_address[1]}"
        self.logger.info(f"Client connected from {client_info}. Total clients: {len(self.clients)}")
        
        try:
            # Send initial connection confirmation
            welcome_message = {
                'type': 'connection_status',
                'status': 'connected',
                'timestamp': asyncio.get_event_loop().time() * 1000,
                'server_info': f"Ghost Wheel WebSocket Server v2.0"
            }
            await websocket.send(json.dumps(welcome_message))
            
            # Keep connection alive
            await websocket.wait_closed()
        except Exception as e:
            self.logger.error(f"Error handling client {client_info}: {e}")
        finally:
            self.clients.remove(websocket)
            self.logger.info(f"Client {client_info} disconnected. Total clients: {len(self.clients)}")
            
    async def broadcast(self, data):
        """Broadcast data to all connected clients"""
        if not self.clients:
            return
            
        # Convert data to JSON with error handling
        try:
            message = json.dumps(data)
        except Exception as e:
            self.logger.error(f"Error serializing data: {e}")
            return
        
        # Track message size for debugging
        message_size = len(message.encode('utf-8'))
        if message_size > 100000:  # Log large messages (>100KB)
            self.logger.debug(f"Sending large message: {message_size/1024:.1f}KB")
        
        # Send to all clients
        disconnected_clients = []
        
        for client in self.clients:
            try:
                await client.send(message)
            except ConnectionClosed:
                disconnected_clients.append(client)
                self.logger.debug(f"Client connection closed during broadcast")
            except WebSocketException as e:
                disconnected_clients.append(client)
                self.logger.debug(f"WebSocket error during broadcast: {e}")
            except Exception as e:
                disconnected_clients.append(client)
                self.logger.error(f"Unexpected error sending to client: {e}")
                
        # Remove disconnected clients
        for client in disconnected_clients:
            self.clients.discard(client)
                
    async def start(self):
        """Start the WebSocket server"""
        self.logger.info(f"Starting WebSocket server on {self.host}:{self.port}")
        
        try:
            # Try modern API first (websockets 12.x+)
            self.server = await websockets.server.serve(
                self.register_client,
                self.host,
                self.port,
                # Increase message size limit for video frames
                max_size=2**20,  # 1MB max message size
                ping_interval=20,  # Send ping every 20 seconds
                ping_timeout=10,   # Wait 10 seconds for pong
                close_timeout=10   # Wait 10 seconds for close
            )
        except AttributeError:
            # Fallback to legacy API (websockets 11.x)
            self.server = await websockets.serve(  # type: ignore
                self.register_client,
                self.host,
                self.port,
                max_size=2**20,  # 1MB max message size
                ping_interval=20,
                ping_timeout=10,
                close_timeout=10
            )
        
        self.logger.info(f"WebSocket server running on ws://{self.host}:{self.port}")
        self.logger.info("Ready to accept connections for Ghost Wheel Sprint 2")
        
    async def stop(self):
        """Stop the WebSocket server"""
        if self.server:
            self.logger.info("Stopping WebSocket server...")
            self.server.close()
            await self.server.wait_closed()
            self.logger.info("WebSocket server stopped")
            
    def get_client_count(self):
        """Get current number of connected clients"""
        return len(self.clients)
        
    async def send_to_client(self, client, data):
        """Send data to a specific client"""
        try:
            message = json.dumps(data)
            await client.send(message)
            return True
        except Exception as e:
            self.logger.error(f"Error sending to specific client: {e}")
            return False