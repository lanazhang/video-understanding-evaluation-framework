"""
Utility functions for DynamoDB operations
"""
import boto3
from boto3.dynamodb.conditions import Key, Attr
from decimal import Decimal
import json

dynamodb = boto3.resource('dynamodb')


def dynamodb_get_by_id(table_name, id, key_name='Id'):
    """
    Get item from DynamoDB by ID
    
    Args:
        table_name: Name of the DynamoDB table
        id: Primary key value
        key_name: Name of the primary key (default: 'Id')
        
    Returns:
        Item dict if found, None otherwise
    """
    try:
        table = dynamodb.Table(table_name)
        response = table.get_item(Key={key_name: id})
        return response.get('Item', None)
    except Exception as ex:
        print(f"Error getting item from DynamoDB: {ex}")
        return None


def dynamodb_get_by_composite_key(table_name, partition_key_value, sort_key_value, partition_key_name='Id', sort_key_name='Type'):
    """
    Get item from DynamoDB by composite key (partition key + sort key)
    
    Args:
        table_name: Name of the DynamoDB table
        partition_key_value: Partition key value
        sort_key_value: Sort key value
        partition_key_name: Name of the partition key (default: 'Id')
        sort_key_name: Name of the sort key (default: 'Type')
        
    Returns:
        Item dict if found, None otherwise
    """
    try:
        table = dynamodb.Table(table_name)
        response = table.get_item(Key={
            partition_key_name: partition_key_value,
            sort_key_name: sort_key_value
        })
        return response.get('Item', None)
    except Exception as ex:
        print(f"Error getting item from DynamoDB: {ex}")
        return None


def dynamodb_table_upsert(table_name, item):
    """
    Insert or update item in DynamoDB table
    
    Args:
        table_name: Name of the DynamoDB table
        item: Item dict to upsert
        
    Returns:
        Response from DynamoDB put_item
    """
    try:
        table = dynamodb.Table(table_name)
        # Convert float to Decimal for DynamoDB
        # Use custom encoder to handle Decimal during serialization
        item_json = json.dumps(item, default=decimal_default)
        item = json.loads(item_json, parse_float=Decimal)
        response = table.put_item(Item=item)
        return response
    except Exception as ex:
        print(f"Error upserting item to DynamoDB: {ex}")
        raise ex


def decimal_default(obj):
    """Helper function to convert Decimal to float for JSON serialization"""
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


def dynamodb_query_by_index(table_name, index_name, key_name, key_value):
    """
    Query DynamoDB table using a global secondary index
    
    Args:
        table_name: Name of the DynamoDB table
        index_name: Name of the GSI
        key_name: Partition key name for the index
        key_value: Value to query
        
    Returns:
        List of items matching the query
    """
    try:
        table = dynamodb.Table(table_name)
        response = table.query(
            IndexName=index_name,
            KeyConditionExpression=Key(key_name).eq(key_value)
        )
        return response.get('Items', [])
    except Exception as ex:
        print(f"Error querying DynamoDB index: {ex}")
        return []


def dynamodb_scan_table(table_name, filter_expression=None):
    """
    Scan DynamoDB table with optional filter
    
    Args:
        table_name: Name of the DynamoDB table
        filter_expression: Optional filter expression
        
    Returns:
        List of items from scan
    """
    try:
        table = dynamodb.Table(table_name)
        if filter_expression:
            response = table.scan(FilterExpression=filter_expression)
        else:
            response = table.scan()
        return response.get('Items', [])
    except Exception as ex:
        print(f"Error scanning DynamoDB table: {ex}")
        return []


def dynamodb_delete_item(table_name, id):
    """
    Delete item from DynamoDB by ID
    
    Args:
        table_name: Name of the DynamoDB table
        id: Primary key value
        
    Returns:
        Response from DynamoDB delete_item
    """
    try:
        table = dynamodb.Table(table_name)
        response = table.delete_item(Key={'Id': id})
        return response
    except Exception as ex:
        print(f"Error deleting item from DynamoDB: {ex}")
        raise ex
