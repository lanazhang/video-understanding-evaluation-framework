import json
import boto3
import os
from datetime import datetime
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
table_name = os.environ.get('DYNAMO_GROUND_TRUTH_TABLE')
table = dynamodb.Table(table_name)

# CORS headers for all responses
CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'POST,PUT,OPTIONS'
}

def convert_floats_to_decimal(obj):
    """Convert float values to Decimal for DynamoDB compatibility"""
    if isinstance(obj, list):
        return [convert_floats_to_decimal(item) for item in obj]
    elif isinstance(obj, dict):
        return {key: convert_floats_to_decimal(value) for key, value in obj.items()}
    elif isinstance(obj, float):
        return Decimal(str(obj))
    return obj

def lambda_handler(event, context):
    """
    Upsert ground truth record to DynamoDB table
    """
    try:
        # Log the incoming event for debugging
        print(f"Received event: {json.dumps(event)}")
        
        # Parse body - handle both string and dict
        body_raw = event.get('body', event)
        if isinstance(body_raw, str):
            body = json.loads(body_raw)
        else:
            body = body_raw
            
        print(f"Parsed body: {json.dumps(body)}")
        
        # Validate required fields
        required_fields = ['Id', 'Name', 'CreatedBy', 'VideoId']
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
            'CreatedBy': body['CreatedBy'],
            'CreatedAt': body.get('CreatedAt', timestamp),
            'VideoId': body['VideoId'],
            'Labels': body.get('Labels', []),
            'UpdatedAt': timestamp
        }
        
        # Convert float values to Decimal for DynamoDB
        item = convert_floats_to_decimal(item)
        
        # Validate Labels structure if provided
        if item['Labels']:
            for idx, label in enumerate(item['Labels']):
                required_label_fields = ['StartTs', 'EndTs', 'Score']
                missing_label_fields = [field for field in required_label_fields if field not in label]
                if missing_label_fields:
                    return {
                        'statusCode': 400,
                        'headers': CORS_HEADERS,
                        'body': json.dumps({
                            'error': f'Label at index {idx} missing required fields: {", ".join(missing_label_fields)}'
                        })
                    }
                
                # Validate ReviewResult enum if provided
                if 'ReviewResult' in label:
                    valid_review_results = ['true_positive', 'false_positive', 'false_negative', 'true_negative', 'unreviewed', 'reviewed']
                    if label['ReviewResult'] not in valid_review_results:
                        return {
                            'statusCode': 400,
                            'headers': CORS_HEADERS,
                            'body': json.dumps({
                                'error': f'Label at index {idx} has invalid ReviewResult. Must be one of: {", ".join(valid_review_results)}'
                            })
                        }
                else:
                    # Set default ReviewResult if not provided
                    label['ReviewResult'] = 'unreviewed'
        
        print(f"Storing item to DynamoDB: {json.dumps(item, default=str)}")
        
        # Store to DynamoDB (upsert)
        table.put_item(Item=item)
        
        return {
            'statusCode': 200,
            'headers': CORS_HEADERS,
            'body': json.dumps({
                'message': 'Ground truth record stored successfully',
                'Id': body['Id'],
                'UpdatedAt': timestamp
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
