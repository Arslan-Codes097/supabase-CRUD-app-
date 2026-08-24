import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabaseUrl = Deno.env.get("SUPABASE_URL")!
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { file_id, storage_path } = await req.json()

    if (!file_id || !storage_path) {
      return new Response(JSON.stringify({ error: "Missing file_id or storage_path" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
    const MAX_SIZE = 10 * 1024 * 1024 // 10MB
    const isValidSize = fileData.size <= MAX_SIZE
    
    // We'll allow PDF, JPEG, PNG, TXT, and DOCX.
    const allowedTypes = [
      'application/pdf', 
      'image/jpeg', 
      'image/png', 
      'text/plain',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' // DOCX
    ]
    
    const isValidType = allowedTypes.includes(fileData.content_type)

    if (!isValidSize || !isValidType) {
      console.log(`Validation failed. Deleting file...`)
      
      // If validation fails, delete the file and the metadata
      await supabase.storage.from("user-files").remove([storage_path])
      await supabase.table("file_metadata").delete().eq("id", file_id)

      return new Response(JSON.stringify({ 
        success: false, 
        message: `File rejected by Edge Function! Type '${fileData.content_type}' is not allowed or file > 10MB.`,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200, 
      })
    }

    console.log("File is valid!")
    return new Response(JSON.stringify({ success: true, message: "File is valid!" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    })
    
  } catch (error) {
    console.error(error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }
})
