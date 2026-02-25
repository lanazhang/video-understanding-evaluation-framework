import json
import boto3
import os
from datetime import datetime
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
table_name = os.environ.get('DYNAMO_EVALUATION_TASK_TABLE')
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
    Upsert evaluation task record to DynamoDB table
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
        required_fields = ['Id', 'Name', 'CreatedBy', 'VideoId', 'GroundTruthId']
        missing_fields = [field for field in required_fields if not body.get(field)]
        
        if missing_fields:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({
                    'error': f'Missing required fields: {", ".join(missing_fields)}'
                })
            }
        
        # Validate Status if provided
        valid_statuses = ['created', 'running', 'completed', 'failed']
        status = body.get('Status', 'created')
        if status not in valid_statuses:
            return {
                'statusCode': 400,
                'headers': CORS_HEADERS,
                'body': json.dumps({
                    'error': f'Invalid Status. Must be one of: {", ".join(valid_statuses)}'
                })
            }
        
        # Prepare item for DynamoDB using PascalCase schema
        timestamp = datetime.utcnow().isoformat() + 'Z'
        item = {
            'Id': body['Id'],
            'Name': body['Name'],
            'Description': body.get('Description', ''),
            'VideoId': body['VideoId'],
            'GroundTruthId': body['GroundTruthId'],
            'CreatedBy': body['CreatedBy'],
            'CreatedAt': body.get('CreatedAt', timestamp),
            'Status': status,
            'AnalyzeTasks': body.get('AnalyzeTasks', []),
            'UpdatedAt': timestamp
        }
        
        # Add CompletedAt if provided
        if body.get('CompletedAt'):
            item['CompletedAt'] = body['CompletedAt']
        
        # Convert float values to Decimal for DynamoDB
        item = convert_floats_to_decimal(item)
        
        # Validate AnalyzeTasks structure if provided
        if item['AnalyzeTasks']:
            for idx, analyze_task in enumerate(item['AnalyzeTasks']):
                if 'VideoAnalyzeTaskId' not in analyze_task:
                    return {
                        'statusCode': 400,
                        'headers': CORS_HEADERS,
                        'body': json.dumps({
                            'error': f'AnalyzeTask at index {idx} missing required field: VideoAnalyzeTaskId'
                        })
                    }
                
                # Validate EvaluationMetrics if provided
                if 'EvaluationMetrics' in analyze_task:
                    metrics = analyze_task['EvaluationMetrics']
                    # Validate metric values are within valid ranges
                    for metric_name in ['Precision', 'Recall', 'F1Score', 'Accuracy', 'MeanIoU', 'MeanAveragePrecision']:
                        if metric_name in metrics:
                            value = float(metrics[metric_name])
                            if not (0 <= value <= 1):
                                return {
                                    'statusCode': 400,
                                    'headers': CORS_HEADERS,
                                    'body': json.dumps({
                                        'error': f'AnalyzeTask at index {idx}: {metric_name} must be between 0 and 1'
                                    })
                                }
                    
                    # Validate count metrics are non-negative integers
                    for metric_name in ['TruePositives', 'FalsePositives', 'TrueNegatives', 'FalseNegatives']:
                        if metric_name in metrics:
                            value = int(metrics[metric_name])
                            if value < 0:
                                return {
                                    'statusCode': 400,
                                    'headers': CORS_HEADERS,
                                    'body': json.dumps({
                                        'error': f'AnalyzeTask at index {idx}: {metric_name} must be non-negative'
                                    })
                                }
        
        print(f"Storing item to DynamoDB: {json.dumps(item, default=str)}")
        
        # Store to DynamoDB (upsert)
        table.put_item(Item=item)
        
        return {
            'statusCode': 200,
            'headers': CORS_HEADERS,
            'body': json.dumps({
                'message': 'Evaluation task record stored successfully',
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
