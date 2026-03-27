import json
from channels.generic.websocket import AsyncWebsocketConsumer

# In-memory store for connected users: {username: channel_name}
connected_users = {}

class CallConsumer(AsyncWebsocketConsumer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.username = None

    async def connect(self):
        await self.accept()

    async def disconnect(self, close_code):
        # Remove user from in-memory dict using stored username
        if self.username and connected_users.get(self.username) == self.channel_name:
            del connected_users[self.username]
            print(f"Unregistered user: {self.username}")

    async def receive(self, text_data):
        data = json.loads(text_data)
        msg_type = data.get('type')

        if msg_type == 'ping':
            # Respond with pong to keep connection alive
            await self.send(text_data=json.dumps({'type': 'pong'}))
            return

        if msg_type == 'register':
            username = data.get('username')
            if username:
                self.username = username
                connected_users[username] = self.channel_name
                print(f"Registered user: {username} -> {self.channel_name}")
            return

        to_user = data.get('to')
        from_user = data.get('from')
        
        # Swapping Logic for caller "You"
        target_user = to_user
        if from_user == 'You':
            if to_user == 'A':
                target_user = 'B'
            elif to_user == 'B':
                target_user = 'A'

        target_channel = connected_users.get(target_user)
        if target_channel:
            event = {
                'type': 'forward_message',
                'payload': data
            }
            await self.channel_layer.send(target_channel, event)
            print(f"Forwarded {msg_type} from {from_user} to {target_user}")
        else:
            print(f"Target user {target_user} not connected. Online: {list(connected_users.keys())}")

    async def forward_message(self, event):
        await self.send(text_data=json.dumps(event['payload']))

