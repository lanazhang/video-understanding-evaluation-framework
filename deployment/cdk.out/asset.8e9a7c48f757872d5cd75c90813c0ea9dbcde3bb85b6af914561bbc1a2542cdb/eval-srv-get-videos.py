import json
import boto3
import os
from boto3.dynamodb.conditions import Key, Attr
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
table_name = os.environ.get('DYNAMO_VIDEO_TABLE')
table = dynamodb.Table(table_name)

class DecimalEncoder(json.JSONEncoder):
    """Helper class to convert DynamoDB Decimal types to JSON"""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return int(obj) if obj % 1 == 0 else float(obj)
        return super(DecimalEncoder, self).default(obj)

def lambda_handler(event, context):
    """
    Get videos from DynamoDB table with pagination support
    Sorted by uploaded_ts in descending order
    Optional filter by uploaded_by
    """
    try:
        # Log the incoming event for debugging
        print(f"Received event: {json.dumps(event)}")
        
        # Parse body - handle both string and dict
        body_raw = event.get('body', '{}')
        if isinstance(body_raw, str):
            body = json.loads(body_raw) if body_raw else {}
        else:
            body = body_raw or {}
            
        print(f"Parsed body: {json.dumps(body)}")
        
        # Get pagination parameters
        limit = body.get('limit', 20)  # Default 20 items per page
        last_evaluated_key = body.get('last_evaluated_key')  # For pagination
        
        # Get filter parameter
        uploaded_by = body.get('uploaded_by', '').strip()
        
        # Build scan parameters
        scan_kwargs = {
            'Limit': limit
        }
        
        # Add filter if uploaded_by is provided
        if uploaded_by:
            scan_kwargs['FilterExpression'] = Attr('uploaded_by').eq(uploaded_by)
        
        # Add pagination token if provided
        if last_evaluated_key:
            scan_kwargs['ExclusiveStartKey'] = last_evaluated_key
        
        print(f"Scan parameters: {json.dumps(scan_kwargs, default=str)}")
        
        # Scan the table
        response = table.scan(**scan_kwargs)
        
        items = response.get('Items', [])
        
        # Sort by uploaded_ts in descending order (newest first)
        items.sort(key=lambda x: x.get('uploaded_ts', ''), reverse=True)
        
        # Prepare response
        result = {
            'videos': items,
            'count': len(items)
        }
        
        # Add pagination token if there are more items
        if 'LastEvaluatedKey' in response:
            result['last_evaluated_key'] = response['LastEvaluatedKey']
            result['has_more'] = True
        else:
            result['has_more'] = False
        
        print(f"Returning {len(items)} videos")
        
        return {
            'statusCode': 200,
            'body': json.dumps(result, cls=DecimalEncoder)
        }
    
    except Exception as e:
        print(f"Error: {str(e)}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }
