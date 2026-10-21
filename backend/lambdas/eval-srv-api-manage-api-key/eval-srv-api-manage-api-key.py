import json
import boto3
import os
from botocore.exceptions import ClientError

secrets_manager = boto3.client('secretsmanager')

def lambda_handler(event, context):
    """
    Manage user API keys in AWS Secrets Manager
    Operations: save, get, delete, check
    """
    try:
        print(f"Received event: {json.dumps(event, default=str)}")
        
        # Parse request - handle both API Gateway and direct invocation
        if 'body' in event:
            # API Gateway invocation
            body = json.loads(event.get('body', '{}')) if isinstance(event.get('body'), str) else event.get('body', {})
        else:
            # Direct invocation (testing) or other invocation method
            body = event
        
        operation = body.get('operation')
        
        # Get username from Cognito claims (API Gateway)
        username = None
        if 'requestContext' in event and 'authorizer' in event['requestContext']:
            username = event['requestContext']['authorizer']['claims'].get('cognito:username')
        
        # Fallback: For testing/development, allow username in body
        if not username and 'username' in body:
            username = body.get('username')
            print(f"Using username from request body: {username}")
        
        print(f"Operation: {operation}, Username: {username}")
        
        if not username:
            print(f"Username not found. Event structure: {json.dumps(event, default=str)}")
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({
                    'success': False,
                    'message': 'Username not found in request context. Please ensure you are authenticated. Check CloudWatch logs for event structure.'
                })
            }
        
        # Construct secret name using username
        secret_name = f"gemini-api-key/{username}"
        print(f"Secret name: {secret_name}")
        
        if operation == 'save':
            api_key = body.get('apiKey')
            if not api_key:
                return {
                    'statusCode': 400,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    'body': json.dumps({
                        'success': False,
                        'message': 'API key is required'
                    })
                }
            
            # Save or update secret
            try:
                secrets_manager.describe_secret(SecretId=secret_name)
                # Secret exists, update it
                secrets_manager.put_secret_value(
                    SecretId=secret_name,
                    SecretString=json.dumps({'apiKey': api_key})
                )
            except secrets_manager.exceptions.ResourceNotFoundException:
                # Secret doesn't exist, create it
                secrets_manager.create_secret(
                    Name=secret_name,
                    Description=f'Gemini API key for user {username}',
                    SecretString=json.dumps({'apiKey': api_key})
                )
            
            return {
                'statusCode': 200,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({
                    'success': True,
                    'message': 'API key saved successfully'
                })
            }
        
        elif operation == 'get':
            try:
                response = secrets_manager.get_secret_value(SecretId=secret_name)
                secret_data = json.loads(response['SecretString'])
                
                return {
                    'statusCode': 200,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    'body': json.dumps({
                        'success': True,
                        'hasKey': True,
                        'apiKey': secret_data.get('apiKey')
                    })
                }
            except secrets_manager.exceptions.ResourceNotFoundException:
                return {
                    'statusCode': 200,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    'body': json.dumps({
                        'success': True,
                        'hasKey': False
                    })
                }
        
        elif operation == 'delete':
            try:
                secrets_manager.delete_secret(
                    SecretId=secret_name,
                    ForceDeleteWithoutRecovery=True
                )
                
                return {
                    'statusCode': 200,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    'body': json.dumps({
                        'success': True,
                        'message': 'API key deleted successfully'
                    })
                }
            except secrets_manager.exceptions.ResourceNotFoundException:
                return {
                    'statusCode': 404,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    'body': json.dumps({
                        'success': False,
                        'message': 'API key not found'
                    })
                }
        
        elif operation == 'check':
            # Check if secret exists without retrieving the value
            try:
                response = secrets_manager.describe_secret(SecretId=secret_name)
                print(f"Secret found: {secret_name}")
                return {
                    'statusCode': 200,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    'body': json.dumps({
                        'success': True,
                        'hasKey': True
                    })
                }
            except secrets_manager.exceptions.ResourceNotFoundException:
                print(f"Secret not found: {secret_name}")
                
                # Try to list secrets to help debug
                try:
                    list_response = secrets_manager.list_secrets(
                        Filters=[
                            {
                                'Key': 'name',
                                'Values': ['gemini-api-key/']
                            }
                        ]
                    )
                    print(f"Available secrets with gemini-api-key prefix: {[s['Name'] for s in list_response.get('SecretList', [])]}")
                except Exception as list_error:
                    print(f"Error listing secrets: {str(list_error)}")
                
                return {
                    'statusCode': 200,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    'body': json.dumps({
                        'success': True,
                        'hasKey': False
                    })
                }
            except Exception as e:
                print(f"Error checking secret: {str(e)}")
                return {
                    'statusCode': 200,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    'body': json.dumps({
                        'success': True,
                        'hasKey': False,
                        'error': str(e)
                    })
                }
        
        else:
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({
                    'success': False,
                    'message': f'Invalid operation: {operation}. Valid operations: save, get, delete, check'
                })
            }
    
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({
                'success': False,
                'message': f'Internal server error: {str(e)}'
            })
        }
