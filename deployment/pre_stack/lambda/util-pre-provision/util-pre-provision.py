"""
Pre-provision Lambda Function
Creates Lambda layers and S3 Vector indexes during stack deployment
"""
import os
import json
import boto3
import subprocess
import shutil
import sys
import zipfile

iam = boto3.client('iam')
s3 = boto3.client('s3')
s3vectors = boto3.client('s3vectors')


def on_event(event, context):
    """CloudFormation custom resource handler"""
    print(json.dumps(event))
    request_type = event['RequestType']
    
    if request_type == 'Create':
        return on_create(event)
    if request_type == 'Update':
        return on_update(event)
    if request_type == 'Delete':
        return on_delete(event)
    
    raise Exception(f"Invalid request type: {request_type}")


def on_create(event):
    """Handle Create event - provision Lambda layers and S3 Vector bucket"""
    # Create Lambda layers
    layers = event.get("Layers")
    if layers:
        for layer in layers:
            layer_name = layer.get("name")
            layer_packages = layer.get("packages")
            s3_bucket = layer.get("s3_bucket")
            s3_key = layer.get("s3_key")
            
            print(f"Creating layer: {layer_name}")
            create_layer_zip(layer_name, layer_packages, s3_bucket, s3_key)
    
    # Create S3 Vector bucket only (indices will be created dynamically per video)
    s3_vectors = event.get("S3Vectors")
    if s3_vectors:
        for v in s3_vectors:
            bucket_name = v["BucketName"]
            
            print(f"Creating S3 Vector bucket: {bucket_name}")
            create_s3_vector_bucket(bucket_name)
    
    return {
        'PhysicalResourceId': 'pre-provision-resource',
        'Data': {
            'Message': 'Pre-provision completed successfully'
        }
    }


def on_update(event):
    """Handle Update event"""
    print("Update event - performing same actions as Create")
    return on_create(event)


def on_delete(event):
    """Handle Delete event - cleanup S3 Vector bucket"""
    print("Delete event - cleaning up S3 Vector bucket")
    
    # Delete S3 Vector bucket (all indices should already be deleted by individual video deletions)
    s3_vectors = event.get("S3Vectors")
    if s3_vectors:
        for v in s3_vectors:
            bucket_name = v["BucketName"]
            
            print(f"Deleting S3 Vector bucket: {bucket_name}")
            delete_s3_vector_bucket(bucket_name)
    
    return {
        'PhysicalResourceId': event.get('PhysicalResourceId', 'pre-provision-resource')
    }


def create_layer_zip(name, packages, s3_bucket, s3_key):
    """
    Create a Lambda layer zip file with specified Python packages
    
    Args:
        name: Layer name
        packages: List of packages with name and version
        s3_bucket: S3 bucket to upload the layer
        s3_key: S3 key for the layer zip file
    """
    folder_name = f'{name.replace("-", "")}_layer'
    zip_file_name = s3_key.split('/')[-1]
    
    print(f"Creating layer folder: {folder_name}, zip: {zip_file_name}")
    
    # Create layer directory structure
    layer_path = f'/tmp/{folder_name}'
    python_path = f'{layer_path}/python'
    
    # Clean up if exists and recreate
    if os.path.exists(layer_path):
        shutil.rmtree(layer_path)
    os.makedirs(python_path, exist_ok=True)
    
    # Install packages
    for p in packages:
        package_name = p["name"]
        package_version = p["version"]
        print(f"Installing {package_name}=={package_version}")
        
        try:
            subprocess.check_call(
                [sys.executable, '-m', 'pip', 'install', 
                 f'{package_name}=={package_version}', 
                 '-t', python_path, 
                 '--no-cache-dir'],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.STDOUT
            )
        except subprocess.CalledProcessError as e:
            print(f"Error installing {package_name}: {e}")
            raise
    
    # Create __init__.py
    os.chdir(layer_path)
    init_file = os.path.join(python_path, '__init__.py')
    open(init_file, 'a').close()
    
    # Create zip file
    zip_path = f'{layer_path}/{zip_file_name}'
    print(f"Creating zip file: {zip_path}")
    zip_folder(layer_path, zip_path)
    
    # Upload to S3
    print(f"Uploading to S3: s3://{s3_bucket}/{s3_key}")
    s3.upload_file(zip_path, s3_bucket, s3_key)
    print(f"Layer {name} uploaded successfully")


def zip_folder(folder_path, zip_path):
    """
    Create a zip file from a folder
    
    Args:
        folder_path: Path to folder to zip
        zip_path: Output zip file path
    """
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(folder_path):
            for file in files:
                if file.endswith('.zip'):
                    # Skip zip files to avoid including the output zip
                    continue
                    
                file_path = os.path.join(root, file)
                rel_path = os.path.relpath(file_path, folder_path)
                zipf.write(file_path, rel_path)
                
    print(f"Zip file created: {zip_path}")


def create_s3_vector_bucket(bucket_name):
    """
    Create S3 Vector bucket only (no indices)
    
    Args:
        bucket_name: Name of the S3 Vector bucket
    """
    try:
        s3vectors.create_vector_bucket(vectorBucketName=bucket_name)
        print(f"Vector bucket '{bucket_name}' created successfully")
    except s3vectors.exceptions.BucketAlreadyOwnedByYou:
        print(f"Vector bucket '{bucket_name}' already exists")
    except Exception as ex:
        print(f"Failed to create S3 vector bucket '{bucket_name}': {ex}")
        # Don't raise - bucket might already exist


def delete_s3_vector_bucket(bucket_name):
    """
    Delete S3 Vector bucket
    Note: All indices must be deleted before the bucket can be deleted
    
    Args:
        bucket_name: Name of the S3 Vector bucket
    """
    try:
        print(f"Deleting vector bucket '{bucket_name}'")
        s3vectors.delete_vector_bucket(vectorBucketName=bucket_name)
        print(f"Vector bucket '{bucket_name}' deleted successfully")
    except s3vectors.exceptions.NoSuchBucket:
        print(f"Vector bucket '{bucket_name}' does not exist")
    except Exception as ex:
        print(f"Failed to delete S3 vector bucket '{bucket_name}': {ex}")
        print("Note: All indices must be deleted before the bucket can be deleted")
        # Don't raise - best effort cleanup
