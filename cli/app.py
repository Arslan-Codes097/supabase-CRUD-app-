import os
import sys
import uuid
import mimetypes
import argparse
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables
load_dotenv()

url = os.environ.get("SUPABASE_URL")
key = os.environ.get("SUPABASE_KEY")

if not url or not key:
    print("Error: SUPABASE_URL and SUPABASE_KEY must be set in .env")
    sys.exit(1)

# Initialize Supabase client
supabase: Client = create_client(url, key)

BUCKET_NAME = "user-files"

def upload_file(filepath: str):
    if not os.path.exists(filepath):
        print(f"Error: File '{filepath}' does not exist.")
        return

    filename = os.path.basename(filepath)
    file_size = os.path.getsize(filepath)
    content_type, _ = mimetypes.guess_type(filepath)
    if not content_type:
        content_type = "application/octet-stream"

    # Generate a unique storage path to avoid collisions
    storage_path = f"{uuid.uuid4()}_{filename}"

    print(f"Uploading {filename} to Supabase Storage...")
    try:
        with open(filepath, "rb") as f:
            res = supabase.storage.from_(BUCKET_NAME).upload(
                file=f,
                path=storage_path,
                file_options={"content-type": content_type}
            )
            print("File uploaded successfully to storage!")

        print("Recording metadata in the database...")
        # Insert metadata into Postgres
        metadata = {
            "filename": filename,
            "size": file_size,
            "content_type": content_type,
            "storage_path": storage_path,
            "owner": "cli_admin"
        }
        db_res = supabase.table("file_metadata").insert(metadata).execute()
        
        print("Metadata recorded successfully!")
        
        # Call Edge Function for validation
        print("Calling Edge Function for validation...")
        try:
            # We pass the file_metadata ID so the function can update the row if it fails
            file_id = db_res.data[0]['id']
            func_res = supabase.functions.invoke("validate-file", invoke_options={
                "body": {"file_id": file_id, "storage_path": storage_path}
            })
            print("Edge Function response:", func_res)
        except Exception as e:
            print(f"Edge Function call failed (maybe not deployed yet?): {e}")

    except Exception as e:
        print(f"Failed to upload: {e}")

def list_files():
    print("Listing all files in database...")
    try:
        response = supabase.table("file_metadata").select("*").execute()
        files = response.data
        if not files:
            print("No files found.")
            return
            
        print(f"{'ID':<38} | {'Filename':<30} | {'Size (bytes)':<15} | {'Created At'}")
        print("-" * 110)
        for f in files:
            print(f"{f.get('id'):<38} | {f.get('filename'):<30} | {f.get('size'):<15} | {f.get('created_at')}")
    except Exception as e:
        print(f"Failed to list files: {e}")

def download_file(file_id: str, download_path: str):
    print(f"Looking up file ID {file_id}...")
    try:
        # Get metadata to find the storage path
        response = supabase.table("file_metadata").select("storage_path, filename").eq("id", file_id).execute()
        if not response.data:
            print(f"Error: File with ID {file_id} not found in database.")
            return
            
        storage_path = response.data[0]["storage_path"]
        original_filename = response.data[0]["filename"]
        
        # If download_path is a directory, append original filename
        if os.path.isdir(download_path):
            download_path = os.path.join(download_path, original_filename)

        print(f"Downloading from storage path '{storage_path}' to '{download_path}'...")
        file_bytes = supabase.storage.from_(BUCKET_NAME).download(storage_path)
        
        with open(download_path, "wb") as f:
            f.write(file_bytes)
            
        print(f"Successfully downloaded to {download_path}")
    except Exception as e:
        print(f"Failed to download: {e}")

def update_file(file_id: str, new_filepath: str):
    if not os.path.exists(new_filepath):
        print(f"Error: File '{new_filepath}' does not exist.")
        return

    print(f"Looking up file ID {file_id}...")
    try:
        # Get current metadata
        response = supabase.table("file_metadata").select("storage_path").eq("id", file_id).execute()
        if not response.data:
            print(f"Error: File with ID {file_id} not found in database.")
            return
            
        old_storage_path = response.data[0]["storage_path"]
        
        # New file details
        filename = os.path.basename(new_filepath)
        file_size = os.path.getsize(new_filepath)
        content_type, _ = mimetypes.guess_type(new_filepath)
        if not content_type:
            content_type = "application/octet-stream"

        new_storage_path = f"{uuid.uuid4()}_{filename}"

        print(f"Uploading replacement file '{filename}'...")
        with open(new_filepath, "rb") as f:
            supabase.storage.from_(BUCKET_NAME).upload(
                file=f,
                path=new_storage_path,
                file_options={"content-type": content_type}
            )
            
        print("Updating database metadata...")
        metadata = {
            "filename": filename,
            "size": file_size,
            "content_type": content_type,
            "storage_path": new_storage_path,
            "owner": "cli_admin"
        }
        supabase.table("file_metadata").update(metadata).eq("id", file_id).execute()
        
        print("Cleaning up old file from storage...")
        supabase.storage.from_(BUCKET_NAME).remove([old_storage_path])
        
        print("File updated successfully!")
    except Exception as e:
        print(f"Failed to update file: {e}")

def delete_file(file_id: str):
    print(f"Looking up file ID {file_id}...")
    try:
        # Get current metadata
        response = supabase.table("file_metadata").select("storage_path").eq("id", file_id).execute()
        if not response.data:
            print(f"Error: File with ID {file_id} not found in database.")
            return
            
        storage_path = response.data[0]["storage_path"]
        
        print("Removing file from storage...")
        supabase.storage.from_(BUCKET_NAME).remove([storage_path])
        
        print("Removing metadata from database...")
        supabase.table("file_metadata").delete().eq("id", file_id).execute()
        
        print("File deleted successfully!")
    except Exception as e:
        print(f"Failed to delete file: {e}")

def main():
    parser = argparse.ArgumentParser(description="Supabase File CRUD CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Create
    parser_create = subparsers.add_parser("create", help="Upload a file")
    parser_create.add_argument("filepath", help="Path to the local file to upload")

    # Read
    parser_read = subparsers.add_parser("list", help="List all files")
    
    parser_download = subparsers.add_parser("download", help="Download a file")
    parser_download.add_argument("id", help="File ID from metadata table")
    parser_download.add_argument("dest", help="Destination path (folder or file)")

    # Update
    parser_update = subparsers.add_parser("update", help="Update/replace a file")
    parser_update.add_argument("id", help="File ID from metadata table")
    parser_update.add_argument("filepath", help="Path to the new file")

    # Delete
    parser_delete = subparsers.add_parser("delete", help="Delete a file")
    parser_delete.add_argument("id", help="File ID from metadata table")

    args = parser.parse_args()

    if args.command == "create":
        upload_file(args.filepath)
    elif args.command == "list":
        list_files()
    elif args.command == "download":
        download_file(args.id, args.dest)
    elif args.command == "update":
        update_file(args.id, args.filepath)
    elif args.command == "delete":
        delete_file(args.id)

if __name__ == "__main__":
    main()
