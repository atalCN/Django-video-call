# call/consumers.py
from urllib.parse import parse_qs
from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token
from channels.generic.websocket import WebsocketConsumer
from asgiref.sync import async_to_sync
import json

connected_users = set()  # Set to store connected users

class CallConsumer(WebsocketConsumer):
    def connect(self):
        
        # Parse the token from the query string
        query_string = self.scope['query_string'].decode()  # decode the query string
        query_params = parse_qs(query_string)
        token = query_params.get('token', [None])[0]  # get the token value
        print('token: ', token)
        if token:
            
            try:
                token_obj = Token.objects.get(key=token)
                self.user = token_obj.user  
                self.my_name = self.user.username  

                async_to_sync(self.channel_layer.group_add)(
                    'user_updates',  # This should match the group you are sending to
                    self.channel_name
                )
                # Add user to connected users
                connected_users.add(self.my_name)
                print("users: ", connected_users)
                self.accept()

                # Notify the client of successful connection
                self.send(text_data=json.dumps({
                    'type': 'connection',
                    'data': {
                        'message': "Connected",
                        'username': self.my_name,
                    }
                }))
                
                # Notify all users of the new connection
                self.send_user_list_update()
            except Token.DoesNotExist:
                # If token is invalid, reject the connection
                self.close()
        else:
            # No token provided, reject the connection
            self.close()

    def disconnect(self, close_code):
        # Leave room group
        async_to_sync(self.channel_layer.group_discard)(
            self.my_name,
            self.channel_name
        )
        
        # async_to_sync(self.channel_layer.group_discard)(
        #     'user_updates',  # This should match the group you are sending to
        #     self.channel_name
        # )
        
        # Remove user from connected users
        connected_users.discard(self.my_name)
        print("users: ", connected_users)
        # Notify all users of the updated user list
        self.send_user_list_update()
        
        
    def send_user_list_update(self):
        # Notify all connected users of the updated user list
        async_to_sync(self.channel_layer.group_send)(
            'user_updates',
            {
                'type': 'user_list_update',
                'data': list(connected_users)
            }
        )
        
    # Receive message from client WebSocket
    def receive(self, text_data):
        text_data_json = json.loads(text_data)
        print('text_data',text_data_json)

        eventType = text_data_json['type']

        if eventType == 'login':
            name = text_data_json['data']['name']

            # we will use this as room name as well
            self.my_name = name
            
            # Add user to connected users
            connected_users.add(self.my_name)
            print("users: ", connected_users)
            # Join room
            async_to_sync(self.channel_layer.group_add)(
                self.my_name,
                self.channel_name
            )
            
            # Notify all users of the updated user list
            self.send_user_list_update()
        
        if eventType == 'call':
            name = text_data_json['data']['name']
            print(self.my_name, "is calling", name);
            # print(text_data_json)


            # to notify the callee we sent an event to the group name
            # and their's groun name is the name
            async_to_sync(self.channel_layer.group_send)(
                name,
                {
                    'type': 'call_received',
                    'data': {
                        'caller': self.my_name,
                        'rtcMessage': text_data_json['data']['rtcMessage']
                    }
                }
            )

        if eventType == 'answer_call':
            # has received call from someone now notify the calling user
            # we can notify to the group with the caller name
            
            caller = text_data_json['data']['caller']
            print(self.my_name, "is answering", caller, "calls.")

            async_to_sync(self.channel_layer.group_send)(
                caller,
                {
                    'type': 'call_answered',
                    'data': {
                        'rtcMessage': text_data_json['data']['rtcMessage']
                    }
                }
            )

        if eventType == 'ICEcandidate':

            user = text_data_json['data']['user']

            async_to_sync(self.channel_layer.group_send)(
                user,
                {
                    'type': 'ICEcandidate',
                    'data': {
                        'rtcMessage': text_data_json['data']['rtcMessage']
                    }
                }
            )

        if eventType == 'chat':
            print('chat recipient: ', text_data_json['data']['recipient'])
            print(f'chat recipient msg to: ', text_data_json['data']['message'])
            send_to = text_data_json['data']['sendto']
            message = text_data_json['data']['message']
            recipient = text_data_json['data']['recipient']
            async_to_sync(self.channel_layer.group_send)(
                send_to,
                {
                    'type': 'sendMessage',
                    'data': {
                        "message" : message , 
                        "username" : recipient ,
                    }
                }
            )
            
            async_to_sync(self.channel_layer.group_send)(
                recipient,
                {
                    'type': 'sendMessage',
                    'data': {
                        "message" : message , 
                        "username" : recipient ,
                    }
                }
            )
            
    def call_received(self, event):

        # print(event)
        print('Call received by ', self.my_name )
        self.send(text_data=json.dumps({
            'type': 'call_received',
            'data': event['data']
        }))


    def call_answered(self, event):

        # print(event)
        print(self.my_name, "'s call answered")
        self.send(text_data=json.dumps({
            'type': 'call_answered',
            'data': event['data']
        }))


    def ICEcandidate(self, event):
        self.send(text_data=json.dumps({
            'type': 'ICEcandidate',
            'data': event['data']
        }))
        
    def user_list_update(self, event):
        self.send(text_data=json.dumps({
            'type': 'user_list_update',
            'data': event['data']
        }))
        
    def sendMessage(self , event) :
        self.send(text_data = json.dumps({
            'type': 'sendMessage',
            'data': event['data']
        }))