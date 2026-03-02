import json
import boto3
import os
from datetime import datetime
from typing import Any, Dict, List

from strands import Agent, tool, ToolContext
from strands.models import BedrockModel

# Initialize AWS clients
lambda_client = boto3.client('lambda')
s3_client = boto3.client('s3')

# Global username context for tools
_current_username = 'unknown'

# Define tools using Strands @tool decorator with context to access agent state
@tool(context=True)
def get_videos(video_id: str = None, created_by: str = None, tool_context: ToolContext = None) -> Dict[str, Any]:
    """List all videos in the system or get videos by specific criteria.
    
    Returns raw JSON with video metadata including ID, name, duration, upload date, and status.
    By default lists all videos unless filtered.
    
    Args:
        video_id: Optional specific video ID to retrieve
        created_by: Optional filter by user who created the video
        
    Returns:
        Dictionary with 'success', 'data_type', 'raw_data', and 'count' fields
    """
    print(f"get_videos called with video_id={video_id}, created_by={created_by}")
    
    body = {}
    if video_id:
        body['Id'] = video_id
    if created_by:
        body['RequestBy'] = created_by
    
    result = _invoke_lambda('bedrock-video-eval-srv-get-videos', body)
    
    print(f"get_videos result: success={result.get('success')}, data_type={result.get('data_type')}, count={result.get('count')}")
    
    # Always store in agent state, even if empty
    if tool_context and result.get('success'):
        data_type = result.get('data_type', 'videos')
        raw_data = result.get('raw_data') if result.get('raw_data') is not None else result.get('data', {}).get('videos', [])
        
        # Get current collection from agent state
        collection = tool_context.agent.state.get("structured_data_collection") or []
        
        # Remove existing entry of same type
        collection = [item for item in collection if item.get('type') != data_type]
        
        # Add new entry (even if empty)
        collection.append({
            'type': data_type,
            'items': raw_data if isinstance(raw_data, list) else []
        })
        
        # Update agent state
        tool_context.agent.state.set("structured_data_collection", collection)
        print(f"Added {data_type} to agent state collection ({len(raw_data) if isinstance(raw_data, list) else 0} items)")
        print(f"Agent state collection now has {len(collection)} types")
    
    return result

@tool
def delete_video(video_id: str) -> Dict[str, Any]:
    """Delete a video by its ID.
    
    This will also remove associated analyze tasks and vector embeddings.
    
    Args:
        video_id: The ID of the video to delete
        
    Returns:
        Dictionary with success status
    """
    return _invoke_lambda('bedrock-video-eval-srv-delete-video', {'Id': video_id})

@tool(context=True)
def get_ground_truths(video_id: str = None, created_by: str = None, tool_context: ToolContext = None) -> Dict[str, Any]:
    """List all ground truths in the system or get ground truths by video ID or creator.
    
    Returns raw JSON data with ground truth labels and metadata.
    
    IMPORTANT: video_id must be the UUID (e.g., "abc123-def456-..."), NOT the video name.
    Call get_videos() first to retrieve video IDs if needed.
    
    Args:
        video_id: Optional UUID of the video (NOT the video name)
        created_by: Optional filter by user who created the ground truth
        
    Returns:
        Dictionary with 'success', 'data_type', 'raw_data', and 'count' fields
    """
    body = {}
    if video_id:
        body['VideoId'] = video_id
    if created_by:
        body['CreatedBy'] = created_by
    
    result = _invoke_lambda('bedrock-video-eval-srv-get-ground-truths', body)
    
    # Always store in agent state, even if empty
    if tool_context and result.get('success'):
        data_type = result.get('data_type', 'ground_truths')
        raw_data = result.get('raw_data', [])
        
        collection = tool_context.agent.state.get("structured_data_collection") or []
        collection = [item for item in collection if item.get('type') != data_type]
        collection.append({
            'type': data_type,
            'items': raw_data if isinstance(raw_data, list) else []
        })
        tool_context.agent.state.set("structured_data_collection", collection)
        print(f"Added {data_type} to agent state ({len(raw_data) if isinstance(raw_data, list) else 0} items)")
    
    return result

@tool
def upsert_ground_truth(video_id: str, name: str, labels: List[Dict] = None) -> Dict[str, Any]:
    """Create or update a ground truth label for a video.
    
    Args:
        video_id: The video ID to create ground truth for
        name: Name/title for the ground truth
        labels: Optional array of label objects with timestamps and descriptions
        
    Returns:
        Dictionary with success status and created ground truth data
    """
    body = {
        'VideoId': video_id,
        'Name': name,
        'CreatedBy': _current_username
    }
    if labels:
        body['Labels'] = labels
    
    return _invoke_lambda('bedrock-video-eval-srv-upsert-ground-truth', body)

@tool
def delete_ground_truth(ground_truth_id: str) -> Dict[str, Any]:
    """Delete a ground truth by its ID.
    
    Args:
        ground_truth_id: The ID of the ground truth to delete
        
    Returns:
        Dictionary with success status
    """
    return _invoke_lambda('bedrock-video-eval-srv-delete-ground-truth', {'Id': ground_truth_id})

@tool(context=True)
def get_evaluation_tasks(video_id: str = None, ground_truth_id: str = None, created_by: str = None, tool_context: ToolContext = None) -> Dict[str, Any]:
    """List all evaluation tasks in the system or get tasks by video ID, ground truth ID, or creator.
    
    Returns raw JSON with evaluation task data.
    By default lists all evaluation tasks unless filtered.
    
    Args:
        video_id: Optional filter by video ID
        ground_truth_id: Optional filter by ground truth ID
        created_by: Optional filter by user who created the task
        
    Returns:
        Dictionary with 'success', 'data_type', 'raw_data', and 'count' fields
    """
    body = {}
    if video_id:
        body['VideoId'] = video_id
    if ground_truth_id:
        body['GroundTruthId'] = ground_truth_id
    if created_by:
        body['CreatedBy'] = created_by
    
    result = _invoke_lambda('bedrock-video-eval-srv-get-evaluation-tasks', body)
    
    # Always store in agent state, even if empty
    if tool_context and result.get('success'):
        data_type = result.get('data_type', 'evaluation_tasks')
        raw_data = result.get('raw_data', [])
        
        collection = tool_context.agent.state.get("structured_data_collection") or []
        collection = [item for item in collection if item.get('type') != data_type]
        collection.append({
            'type': data_type,
            'items': raw_data if isinstance(raw_data, list) else []
        })
        tool_context.agent.state.set("structured_data_collection", collection)
        print(f"Added {data_type} to agent state ({len(raw_data) if isinstance(raw_data, list) else 0} items)")
    
    return result

@tool
def upsert_evaluation_task(name: str, ground_truth_id: str, video_id: str) -> Dict[str, Any]:
    """Create or update an evaluation task to compare model outputs against ground truth.
    
    Args:
        name: Name for the evaluation task
        ground_truth_id: Ground truth ID to evaluate against
        video_id: Video ID being evaluated
        
    Returns:
        Dictionary with success status and created task data
    """
    body = {
        'Name': name,
        'GroundTruthId': ground_truth_id,
        'VideoId': video_id,
        'CreatedBy': _current_username
    }
    
    return _invoke_lambda('bedrock-video-eval-srv-upsert-evaluation-task', body)

@tool
def delete_evaluation_task(evaluation_task_id: str) -> Dict[str, Any]:
    """Delete an evaluation task by its ID.
    
    Args:
        evaluation_task_id: The ID of the evaluation task to delete
        
    Returns:
        Dictionary with success status
    """
    return _invoke_lambda('bedrock-video-eval-srv-delete-evaluation-task', {'Id': evaluation_task_id})

@tool(context=True)
def get_analyze_tasks(video_id: str, task_type: str = None, tool_context: ToolContext = None) -> Dict[str, Any]:
    """Get video analysis tasks (embeddings, understanding results) for a specific video.
    
    Returns raw JSON with analyze task data.
    
    Args:
        video_id: The video ID to get analyze tasks for
        task_type: Optional filter by task type (e.g., 'nova-mme', 'tlabs-mme', 'video-understanding')
        
    Returns:
        Dictionary with 'success', 'data_type', 'raw_data', and 'count' fields
    """
    body = {'VideoId': video_id}
    if task_type:
        body['Type'] = task_type
    
    result = _invoke_lambda('bedrock-video-eval-srv-get-analyze-tasks', body)
    
    # Always store in agent state, even if empty
    if tool_context and result.get('success'):
        data_type = result.get('data_type', 'analyze_tasks')
        raw_data = result.get('raw_data', [])
        
        collection = tool_context.agent.state.get("structured_data_collection") or []
        collection = [item for item in collection if item.get('type') != data_type]
        collection.append({
            'type': data_type,
            'items': raw_data if isinstance(raw_data, list) else []
        })
        tool_context.agent.state.set("structured_data_collection", collection)
        print(f"Added {data_type} to agent state ({len(raw_data) if isinstance(raw_data, list) else 0} items)")
    
    return result

@tool
def delete_analyze_task(task_id: str) -> Dict[str, Any]:
    """Delete a video analysis task by its ID.
    
    Args:
        task_id: The ID of the analyze task to delete
        
    Returns:
        Dictionary with success status
    """
    return _invoke_lambda('bedrock-video-eval-srv-delete-analyze-task', {'Id': task_id})

def generate_presigned_url(s3_url: str, expiration: int = 3600) -> str:
    """Generate presigned URL from S3 URL.
    
    Args:
        s3_url: S3 URL in format https://bucket.s3.amazonaws.com/key
        expiration: URL expiration time in seconds
        
    Returns:
        Presigned URL or original URL if generation fails
    """
    try:
        # Parse S3 URL to extract bucket and key
        if 's3.amazonaws.com' in s3_url:
            parts = s3_url.replace('https://', '').split('/')
            bucket = parts[0].split('.s3.amazonaws.com')[0]
            key = '/'.join(parts[1:])
            
            # Generate presigned URL
            presigned_url = s3_client.generate_presigned_url(
                'get_object',
                Params={'Bucket': bucket, 'Key': key},
                ExpiresIn=expiration
            )
            return presigned_url
    except Exception as e:
        print(f"Error generating presigned URL: {e}")
    
    return s3_url

def enrich_videos_with_presigned_urls(videos: List[Dict]) -> List[Dict]:
    """Add presigned URLs to video data.
    
    Args:
        videos: List of video dictionaries
        
    Returns:
        Videos with presigned URLs added
    """
    for video in videos:
        # Generate presigned URL for video
        if video.get('S3Uri'):
            video['PresignedVideoUrl'] = generate_presigned_url(video['S3Uri'])
        
        # Generate presigned URL for thumbnail
        if video.get('ThumbnailS3Uri'):
            video['PresignedThumbnailUrl'] = generate_presigned_url(video['ThumbnailS3Uri'])
    
    return videos

def remove_thinking_tags(text: str) -> str:
    """Remove <thinking> tags and their content from the response.
    
    Args:
        text: The text that may contain thinking tags
        
    Returns:
        Text with thinking tags removed
    """
    import re
    # Remove <thinking>...</thinking> blocks (including newlines)
    cleaned = re.sub(r'<thinking>.*?</thinking>', '', text, flags=re.DOTALL)
    # Clean up extra whitespace/newlines left behind
    cleaned = re.sub(r'\n\s*\n\s*\n', '\n\n', cleaned)
    return cleaned.strip()

def extract_actions_from_response(text: str) -> tuple[str, List[Dict]]:
    """Extract navigation actions from the agent's response.
    
    Looks for patterns like:
    - "navigate to ground truth page"
    - "go to the ground truth list"
    - "create ground truth" (implies navigation)
    
    Args:
        text: The agent's response text
        
    Returns:
        Tuple of (cleaned_text, actions_list)
    """
    import re
    actions = []
    
    # Check for ground truth creation mentions
    gt_patterns = [
        r'navigate to (?:the )?ground truth',
        r'go to (?:the )?ground truth',
        r'visit (?:the )?ground truth',
        r'create (?:a )?(?:new )?ground truth',
        r'start creating (?:a )?ground truth'
    ]
    
    text_lower = text.lower()
    for pattern in gt_patterns:
        if re.search(pattern, text_lower):
            actions.append({
                'type': 'navigate',
                'target': 'ground-truth',
                'description': 'Go to Ground Truth page'
            })
            break
    
    # Check for video page mentions
    video_patterns = [
        r'navigate to (?:the )?videos? page',
        r'go to (?:the )?videos? page',
        r'visit (?:the )?videos? page'
    ]
    
    for pattern in video_patterns:
        if re.search(pattern, text_lower):
            actions.append({
                'type': 'navigate',
                'target': 'videos',
                'description': 'Go to Videos page'
            })
            break
    
    # Check for evaluation page mentions
    eval_patterns = [
        r'navigate to (?:the )?evaluations? page',
        r'go to (?:the )?evaluations? page',
        r'visit (?:the )?evaluations? page'
    ]
    
    for pattern in eval_patterns:
        if re.search(pattern, text_lower):
            actions.append({
                'type': 'navigate',
                'target': 'evaluations',
                'description': 'Go to Evaluations page'
            })
            break
    
    return text, actions

def _invoke_lambda(function_name: str, body: Dict[str, Any]) -> Dict[str, Any]:
    """Helper function to invoke Lambda functions and return raw JSON responses.
    
    Args:
        function_name: Name of the Lambda function to invoke
        body: Request body to send
        
    Returns:
        Raw parsed response data with type information for agent processing
    """
    try:
        payload = {
            'body': json.dumps(body),
            'requestContext': {
                'authorizer': {
                    'claims': {
                        'cognito:username': _current_username
                    }
                }
            }
        }
        
        response = lambda_client.invoke(
            FunctionName=function_name,
            InvocationType='RequestResponse',
            Payload=json.dumps(payload)
        )
        
        response_payload = json.loads(response['Payload'].read())
        
        if response_payload.get('statusCode') == 200:
            body = response_payload.get('body', '{}')
            if isinstance(body, str):
                body = json.loads(body)
            
            # Determine data type and extract raw data
            data_type = None
            raw_data = None
            
            # Check if response already has raw_data (from get_ground_truths, etc.)
            if body.get('raw_data') is not None:
                raw_data = body.get('raw_data')
                
                # Determine data type from the content or response structure
                if raw_data and len(raw_data) > 0:
                    first_item = raw_data[0]
                    if 'VideoId' in first_item and 'Labels' in first_item:
                        data_type = 'ground_truths'
                    elif 'GroundTruthId' in first_item:
                        data_type = 'evaluation_tasks'
                    elif 'Type' in first_item:
                        data_type = 'analyze_tasks'
                # Even if empty, try to infer from function name
                elif isinstance(raw_data, list):
                    if 'ground-truth' in function_name:
                        data_type = 'ground_truths'
                    elif 'evaluation-task' in function_name:
                        data_type = 'evaluation_tasks'
                    elif 'analyze-task' in function_name:
                        data_type = 'analyze_tasks'
            
            # Check for videos in nested 'data' object or top-level
            elif body.get('data', {}).get('videos') or body.get('Videos'):
                data_type = 'videos'
                raw_data = body.get('data', {}).get('videos') or body.get('Videos')
                # Enrich with presigned URLs
                raw_data = enrich_videos_with_presigned_urls(raw_data)
                print(f"Prepared {len(raw_data)} videos with presigned URLs")
                
            elif 'Tasks' in body:
                data_type = 'analyze_tasks'
                raw_data = body['Tasks']
                
            elif body.get('GroundTruths') or body.get('groundTruths'):
                data_type = 'ground_truths'
                raw_data = body.get('GroundTruths') or body.get('groundTruths')
                
            elif body.get('EvaluationTasks') or body.get('evaluationTasks'):
                data_type = 'evaluation_tasks'
                raw_data = body.get('EvaluationTasks') or body.get('evaluationTasks')
            
            # Return raw data with type information for agent to process
            if data_type and raw_data is not None:
                return {
                    'success': True,
                    'data_type': data_type,
                    'raw_data': raw_data,
                    'count': len(raw_data) if isinstance(raw_data, list) else 1
                }
            
            return {'success': True, 'data': body}
        else:
            return {'success': False, 'error': response_payload.get('body', 'Unknown error')}
            
    except Exception as e:
        print(f"Error invoking Lambda {function_name}: {str(e)}")
        return {'error': str(e), 'success': False}

def lambda_handler(event, context):
    """
    Chatbot handler using Amazon Nova 2 Lite with Strands agent framework
    """
    global _current_username
    
    print("=== Starting new chatbot request ===")
    
    try:
        # Parse request - handle both API Gateway proxy format and direct invocation
        if 'body' in event:
            if isinstance(event['body'], str):
                body = json.loads(event['body'])
            else:
                body = event['body']
        else:
            body = event
        
        user_message = body.get('message', '')
        conversation_history = body.get('conversationHistory', [])
        username_from_body = body.get('username')  # Get username from request body if provided
        
        # Extract username from request context (Cognito authorizer)
        username = 'unknown'
        try:
            request_context = event.get('requestContext', {})
            if request_context:
                authorizer = request_context.get('authorizer', {})
                claims = authorizer.get('claims', {})
                username = claims.get('cognito:username', 'unknown')
                print(f"Extracted username from Cognito: {username}")
            else:
                print("Warning: No requestContext found in event")
                print(f"Event keys: {list(event.keys())}")
        except Exception as e:
            print(f"Could not extract username from Cognito: {e}")
            print(f"Event structure: {json.dumps(event, default=str)[:500]}")
        
        # Use username from body if Cognito username is not available
        if username == 'unknown' and username_from_body:
            username = username_from_body
            print(f"Using username from request body: {username}")
        
        _current_username = username
        
        if not user_message:
            return {
                'statusCode': 400,
                'headers': {'Content-Type': 'application/json'},
                'body': json.dumps({'error': 'Message is required'})
            }
        
        print(f"Processing message from user {username}: {user_message}")
        
        # Create Strands agent with Bedrock Nova 2 Lite model
        # Note: system_prompt is passed to Agent, not BedrockModel
        bedrock_model = BedrockModel(
            model_id="us.amazon.nova-lite-v1:0",
            region_name=os.environ.get('AWS_REGION', 'us-east-1'),
            temperature=0.7,
            max_tokens=4096
        )
        
        # Create agent with all tools and system prompt
        agent = Agent(
            model=bedrock_model,
            tools=[
                get_videos,
                delete_video,
                get_ground_truths,
                upsert_ground_truth,
                delete_ground_truth,
                get_evaluation_tasks,
                upsert_evaluation_task,
                delete_evaluation_task,
                get_analyze_tasks,
                delete_analyze_task
            ],
            system_prompt=build_system_prompt()
        )
        
        # Build conversation context from history (limit to last 5 exchanges to avoid token limits)
        conversation_context = ""
        recent_history = conversation_history[-5:] if len(conversation_history) > 5 else conversation_history
        
        for msg in recent_history:
            if msg.get('role') == 'user':
                conversation_context += f"User: {msg.get('content', '')}\n"
            elif msg.get('role') == 'assistant':
                # Truncate long assistant responses in context
                content = msg.get('content', '')
                if len(content) > 500:
                    content = content[:500] + "..."
                conversation_context += f"Assistant: {content}\n"
        
        # Combine context with current message
        full_message = conversation_context + f"User: {user_message}" if conversation_context else user_message
        
        # Run agent with error handling
        try:
            agent_result = agent(full_message)
            # Extract text from AgentResult object but keep thinking tags
            response_text = str(agent_result)
            # Extract navigation actions from response
            response_text, actions = extract_actions_from_response(response_text)
        except Exception as e:
            error_msg = str(e)
            print(f"Agent error: {error_msg}")
            
            # Check if it's a max tokens error
            if 'max_tokens' in error_msg.lower() or 'MaxTokensReachedException' in error_msg:
                response_text = "I apologize, but our conversation has become too long. Please start a new conversation or ask your question more concisely."
                actions = []
            # Check if it's a model stream error (invalid tool use)
            elif 'modelStreamErrorException' in error_msg or 'invalid sequence' in error_msg.lower():
                print(f"Model stream error detected. Full error: {error_msg}")
                response_text = "I encountered an issue processing your request. Please try rephrasing your question or ask something else."
                actions = []
            else:
                # Re-raise other exceptions to be caught by outer handler
                raise
        
        # Get structured data collected during tool execution from agent state
        structured_data_collection = agent.state.get("structured_data_collection") or []
        print(f"Structured data from agent state: {len(structured_data_collection)} types")
        for item in structured_data_collection:
            print(f"  - {item.get('type')}: {len(item.get('items', []))} items")
        
        print(f"Final structured data count: {len(structured_data_collection)} types")
        for item in structured_data_collection:
            print(f"  - {item.get('type')}: {len(item.get('items', []))} items")
        
        return {
            'statusCode': 200,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({
                'response': response_text,
                'data': structured_data_collection,
                'actions': actions,
                'timestamp': datetime.utcnow().isoformat()
            })
        }
        
    except Exception as e:
        print(f"Error in chatbot handler: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({
                'error': 'Internal server error',
                'message': str(e)
            })
        }

def build_system_prompt() -> str:
    """Build system prompt for the agent"""
    return """You are an AI assistant for a Video Understanding Evaluation system. Help users manage videos, ground truths, and evaluations.

Your capabilities:
- List, view, and delete videos
- Create, view, and delete ground truth labels
- Create, view, and delete evaluation tasks
- Get video analysis results (embeddings, understanding)

CRITICAL TOOL USAGE RULES:
1. When filtering by video, ALWAYS use the video ID (UUID format like "abc123-def456-..."), NEVER use the video name
2. First call get_videos() to retrieve video IDs, then use those IDs in subsequent tool calls
3. Video IDs are found in the 'Id' field of video objects, not the 'Name' field
4. ALWAYS provide valid parameter values - use None or omit optional parameters if you don't have values
5. DO NOT make up or guess parameter values - only use actual values from tool responses

CREATING GROUND TRUTHS:
When users ask about creating a new ground truth, you should:
1. Explain that ground truths are created through an interactive wizard interface
2. Instruct them to navigate to the Ground Truth List page to start the creation process
3. Mention that the wizard will guide them through selecting a video and adding labeled segments

CRITICAL RESPONSE GUIDELINES:
Tools return raw JSON data in the format: {'success': True, 'data_type': 'videos', 'raw_data': [...], 'count': N}

IMPORTANT: A tool response with 'success': True and 'count': 0 means NO RECORDS FOUND, NOT AN ERROR!

When you receive tool responses:
1. Check the 'success' field first:
   - If success is True and count is 0: Say "No records found" (this is NOT an error)
   - If success is False: There was an actual error (rare)
2. Parse the 'raw_data' field to understand the content when count > 0
3. Provide a high-level summary - DO NOT list individual items or details
4. Provide counts, themes, and insights from the data
5. Keep responses concise and conversational
6. Mention that complete details are available in the structured data panel when data exists

HANDLING EMPTY RESULTS (success: True, count: 0):
When tools return empty results, this is NORMAL and NOT AN ERROR. Respond helpfully:
✓ GOOD: "No videos found in the system. You can upload a video to get started."
✓ GOOD: "No ground truths have been created yet for this video. Would you like to create one?"
✓ GOOD: "No evaluation tasks found. Create one by selecting a ground truth and video."
✗ BAD: "There was an error retrieving the data"
✗ BAD: "The system encountered a problem"
✗ BAD: "This could be due to a temporary issue"

HANDLING ACTUAL ERRORS (success: False):
Only when success is False should you mention system issues or errors.

Example for videos with data:
✓ GOOD: "You have 5 videos in the system covering topics like sports and commercials. Most are completed and ready for analysis."
✗ BAD: Listing each video with its ID, name, duration, etc.

Example for ground truths with data:
✓ GOOD: "There are 3 ground truths created, covering 2 different videos. They include labels for key moments and scenes."
✗ BAD: Listing each ground truth with all its labels and timestamps.

NAVIGATION ACTIONS:
When appropriate, navigation actions will be automatically detected from your response text:
- If you mention navigating to ground truth page, a button will appear automatically
- If you mention going to videos page, a button will appear automatically  
- If you mention visiting evaluations page, a button will appear automatically

DO NOT include <action> tags in your response - the system detects navigation intent from your natural language.

Be helpful, insightful, and efficient. Focus on insights, not data dumps. Remember: Empty results (count: 0) are normal, not errors!"""
