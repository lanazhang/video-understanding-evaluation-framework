import json
import boto3
import os
from datetime import datetime

dynamodb = boto3.resource('dynamodb')
lambda_client = boto3.client('lambda')
table_name = os.environ.get('DYNAMO_VIDEO_TABLE')
metadata_lambda_name = os.environ.get('METADATA_LAMBDA_NAME')
nova_mme_lambda_name = os.environ.get('NOVA_MME_LAMBDA_NAME')
tlabs_mme_lambda_name = os.environ.get('TLABS_MME_LAMBDA_NAME')
table = dynamodb.Table(table_name)

# CORS headers for all responses
CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
}

def lambda_handler(event, context):
    """
    Add video metadata to DynamoDB table and invoke metadata extraction asynchronously
    """
    try:
        # Log the incoming event for debugging
        print(f"Received event: {json.dumps(event)}")
        
        # Parse body - handle both string and dict
        body_raw = event
        if isinstance(body_raw, str):
            body = json.loads(body_raw)
        else:
            body = body_raw
            
        print(f"Parsed body: {json.dumps(body)}")
        
        # Get user info from request body
        uploaded_by = body.get('UploadedBy', 'unknown')
        
        # Validate required fields (accept PascalCase from UI)
        required_fields = ['Id', 'Name', 'S3Bucket', 'S3KeyVideo']
        missing_fields = [field for field in required_fields if not body.get(field)]
        
        if missing_fields:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({
                    'error': f'Missing required fields: {", ".join(missing_fields)}'
                })
            }
        
        # Prepare item for DynamoDB using PascalCase schema
        timestamp = datetime.utcnow().isoformat() + 'Z'
        item = {
            'Id': body['Id'],
            'Name': body['Name'],
            'Description': body.get('Description', ''),
            'S3Bucket': body['S3Bucket'],
            'S3KeyVideo': body['S3KeyVideo'],
            'UploadedTs': timestamp,
            'UploadedBy': uploaded_by
        }
        
        # Generate thumbnail key based on video key
        video_key = body['S3KeyVideo']
        path_parts = video_key.rsplit('/', 1)
        if len(path_parts) == 2:
            base_path = path_parts[0]
            filename = path_parts[1]
            # Remove extension and add thumbnail path
            name_without_ext = filename.rsplit('.', 1)[0]
            item['S3KeyThumbnail'] = f"{base_path}/thumbnails/{name_without_ext}.jpg"
        
        print(f"Storing item to DynamoDB: {json.dumps(item, default=str)}")
        
        # Store to DynamoDB
        table.put_item(Item=item)
        
        # Invoke metadata extraction Lambda asynchronously
        if metadata_lambda_name:
            payload = {
                'Id': body['Id'],
                'S3Bucket': body['S3Bucket'],
                'S3KeyVideo': body['S3KeyVideo']
            }
            print(f"Invoking metadata Lambda: {metadata_lambda_name}")
            lambda_client.invoke(
                FunctionName=metadata_lambda_name,
                InvocationType='Event',  # Async invocation
                Payload=json.dumps(payload)
            )
            print(f"Metadata extraction Lambda invoked asynchronously")
        
        # Invoke embedding task creation if embedding configs are provided
        embedding_configs = body.get('EmbeddingConfigs', [])
        if embedding_configs and (nova_mme_lambda_name or tlabs_mme_lambda_name):
            for config in embedding_configs:
                model_name = config.get('ModelName', '').lower()
                model_id = config.get('ModelId', '')
                
                # Check if this is a Nova MME model
                if 'nova' in model_name and nova_mme_lambda_name:
                    try:
                        # Build payload for Nova MME Lambda
                        nova_payload = {
                            'VideoId': body['Id'],
                            'ModelId': model_id,
                            'Description': f"Auto-generated embeddings using {config.get('ModelName')}",
                            'Request': {
                                'DurationS': config.get('Config', {}).get('DurationS', 5),
                                'EmbedMode': config.get('Config', {}).get('EmbedMode', 'AUDIO_VIDEO_COMBINED'),
                                'EmbeddingDim': config.get('Config', {}).get('EmbeddingDim', 1024),
                                'RequestedBy': uploaded_by
                            }
                        }
                        
                        print(f"Invoking Nova MME Lambda: {nova_mme_lambda_name}")
                        print(f"Payload: {json.dumps(nova_payload)}")
                        
                        lambda_client.invoke(
                            FunctionName=nova_mme_lambda_name,
                            InvocationType='Event',  # Async invocation
                            Payload=json.dumps(nova_payload)
                        )
                        print(f"Nova MME task creation Lambda invoked asynchronously")
                    except Exception as e:
                        print(f"Error invoking Nova MME Lambda: {str(e)}")
                        # Don't fail the whole operation if embedding invocation fails
                
                # Check if this is a TwelveLabs model
                elif ('twelvelabs' in model_name or 'marengo' in model_name) and tlabs_mme_lambda_name:
                    try:
                        # Build payload for TwelveLabs MME Lambda
                        tlabs_payload = {
                            'VideoId': body['Id'],
                            'ModelId': model_id,
                            'Description': f"Auto-generated embeddings using {config.get('ModelName')}",
                            'Request': config.get('Config', {})
                        }
                        
                        print(f"Invoking TwelveLabs MME Lambda: {tlabs_mme_lambda_name}")
                        print(f"Payload: {json.dumps(tlabs_payload)}")
                        
                        lambda_client.invoke(
                            FunctionName=tlabs_mme_lambda_name,
                            InvocationType='Event',  # Async invocation
                            Payload=json.dumps(tlabs_payload)
                        )
                        print(f"TwelveLabs MME task creation Lambda invoked asynchronously")
                    except Exception as e:
                        print(f"Error invoking TwelveLabs MME Lambda: {str(e)}")
                        # Don't fail the whole operation if embedding invocation fails
        
        return {
            'statusCode': 200,
            'headers': CORS_HEADERS,
            'body': json.dumps({
                'message': 'Video metadata stored successfully',
                'Id': body['Id'],
                'UploadedTs': timestamp
            })
        }
    
    except Exception as e:
        print(f"Error: {str(e)}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        return {
            'statusCode': 500,
            'headers': CORS_HEADERS,
            'body': json.dumps({'error': str(e)})
        }
