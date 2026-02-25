import json
import boto3
import os
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
DYNAMO_VIDEO_ANALYZE_TABLE = os.environ.get('DYNAMO_VIDEO_ANALYZE_TABLE')
analyze_table = dynamodb.Table(DYNAMO_VIDEO_ANALYZE_TABLE)

# CORS headers for all responses
CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
}


class DecimalEncoder(json.JSONEncoder):
    """Helper class to convert Decimal to float for JSON serialization"""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super(DecimalEncoder, self).default(obj)


def lambda_handler(event, context):
    """
    Get analyze tasks from DynamoDB by VideoId and optional Type
    
    Request body parameters:
    - VideoId (required): The video ID to query tasks for
    - Type (optional): Filter by specific task type
    """
    try:
        print(f"Received event: {json.dumps(event)}")
        
        # Parse request body - handle both API Gateway and direct invocation
        if 'body' in event:
            # API Gateway proxy integration
            body = event['body']
            if isinstance(body, str):
                body = json.loads(body)
        else:
            # Direct invocation
            body = event
            if isinstance(body, str):
                body = json.loads(body)
        
        print(f"Parsed body: {json.dumps(body)}")
        
        video_id = body.get('VideoId')
        task_type = body.get('Type')
        
        if not video_id:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': 'Missing required parameter: VideoId'})
            }
        
        print(f"Querying analyze tasks for VideoId: {video_id}, Type: {task_type}")
        
        # Query using VideoId-index GSI
        if task_type:
            # Query with both VideoId and Type filter
            response = analyze_table.query(
                IndexName='VideoId-index',
                KeyConditionExpression='VideoId = :video_id',
                FilterExpression='#type = :task_type',
                ExpressionAttributeNames={
                    '#type': 'Type'  # 'Type' might be a reserved word
                },
                ExpressionAttributeValues={
                    ':video_id': video_id,
                    ':task_type': task_type
                }
            )
        else:
            # Query with just VideoId
            response = analyze_table.query(
                IndexName='VideoId-index',
                KeyConditionExpression='VideoId = :video_id',
                ExpressionAttributeValues={
                    ':video_id': video_id
                }
            )
        
        tasks = response.get('Items', [])
        print(f"Found {len(tasks)} tasks for VideoId: {video_id}")
        
        # Sort tasks by StartedTs (most recent first) if available
        tasks.sort(key=lambda x: x.get('StartedTs', ''), reverse=True)
        
        return {
            'statusCode': 200,
            'headers': CORS_HEADERS,
            'body': json.dumps({
                'VideoId': video_id,
                'Type': task_type,
                'Count': len(tasks),
                'Tasks': tasks
            }, cls=DecimalEncoder)
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
