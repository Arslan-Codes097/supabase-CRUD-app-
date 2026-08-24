import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// We initialize the Supabase client using the environment variables
// that Supabase automatically provides to its Edge Functions.
const supabaseUrl = Deno.env.get("SUPABASE_URL")!
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

serve(async (req) => {
  try {
    const { file_id, storage_path } = await req.json()

    if (!file_id || !storage_path) {
      return new Response(JSON.stringify({ error: "Missing file_id or storage_path" }), {
        headers: { "Content-Type": "application/json" },
        status: 400,
      })
    }

    console.log(`Validating file_id: ${file_id}, path: ${storage_path}`)

    // 1. Get the file metadata from the database
    const { data: fileData, error: dbError } = await supabase
      .table("file_metadata")
      .select("*")
      .eq("id", file_id)
      .single()

    if (dbError || !fileData) {
      throw new Error(`Failed to fetch file metadata: ${dbError?.message}`)
    }

    // 2. Perform Validation
    // Example rule: File size must be less than 10MB (10 * 1024 * 1024 bytes)
    const MAX_SIZE = 10 * 1024 * 1024 
    const isValidSize = fileData.size <= MAX_SIZE
    
    // Example rule: Only allow certain MIME types
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'text/plain']
    const isValidType = allowedTypes.includes(fileData.content_type)

    if (!isValidSize || !isValidType) {
      console.log(`Validation failed. Deleting file...`)
      
      // If validation fails, we delete the file from storage
      await supabase.storage.from("user-files").remove([storage_path])
      // And we delete the metadata record
      await supabase.table("file_metadata").delete().eq("id", file_id)

      return new Response(JSON.stringify({ 
        success: false, 
        message: "File failed validation and was deleted.",
        details: { validSize: isValidSize, validMime: isValidType }
      }), {
        headers: { "Content-Type": "application/json" },
        status: 400,
      })
    }

    console.log("File is valid!")
    return new Response(JSON.stringify({ success: true, message: "File is valid!" }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    })
    
  } catch (error) {
    console.error(error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    })
  }
})
