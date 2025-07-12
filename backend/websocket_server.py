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
        
    async def register_client(self, websocket, path):
        """Register a new client"""
        self.clients.add(websocket)
        print(f"Client connected. Total clients: {len(self.clients)}")
        
        try:
            await websocket.wait_closed()
        finally:
            self.clients.remove(websocket)
            print(f"Client disconnected. Total clients: {len(self.clients)}")
            
    async def broadcast(self, data):
        """Broadcast data to all connected clients"""
        if self.clients:
            # Convert data to JSON
            message = json.dumps(data)
            
            # Send to all clients
            disconnected_clients = []
            
            for client in self.clients:
                try:
                    await client.send(message)
                except (ConnectionClosed, WebSocketException) as e:
                    disconnected_clients.append(client)
                except Exception as e:
                    # Generic exception handling for other network issues
                    print(f"Error sending to client: {e}")
                    disconnected_clients.append(client)
                    
            # Remove disconnected clients
            for client in disconnected_clients:
                self.clients.discard(client)
                
    async def start(self):
        """Start the WebSocket server"""
        print(f"Starting WebSocket server on {self.host}:{self.port}")
        
        try:
            # Try modern API first (websockets 12.x+)
            self.server = await websockets.server.serve(
                self.register_client,
                self.host,
                self.port
            )
        except AttributeError:
            # Fallback to legacy API (websockets 11.x)
            self.server = await websockets.serve( #type: ignore
                self.register_client,
                self.host,
                self.port
            )
        
        print(f"WebSocket server running on ws://{self.host}:{self.port}")
        
    async def stop(self):
        """Stop the WebSocket server"""
        if self.server:
            self.server.close()
            await self.server.wait_closed()
            print("WebSocket server stopped")