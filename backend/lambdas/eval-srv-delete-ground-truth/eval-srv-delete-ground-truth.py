import json
import boto3
import os

dynamodb = boto3.resource('dynamodb')
table_name = os.environ.get('DYNAMO_GROUND_TRUTH_TABLE')
table = dynamodb.Table(table_name)

# CORS headers for all responses
CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'DELETE,OPTIONS'
}

def lambda_handler(event, context):
    """
    Delete ground truth record from DynamoDB table
    """
    try:
        print(f"Received event: {json.dumps(event)}")
        
        # Parse body - handle both string and dict
        body_raw = event.get('body', event)
        if isinstance(body_raw, str):
            body = json.loads(body_raw)
        else:
            body = body_raw
        
        # Get ground truth ID
        ground_truth_id = body.get('Id')
        
        if not ground_truth_id:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({'error': 'Missing required field: Id'})
            }
        
        print(f"Deleting ground truth record: {ground_truth_id}")
        
        # Delete from DynamoDB
        table.delete_item(
            Key={'Id': ground_truth_id}
        )
        
        return {
            'statusCode': 200,
            'headers': CORS_HEADERS,
            'body': json.dumps({
                'message': 'Ground truth record deleted successfully',
                'Id': ground_truth_id
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
