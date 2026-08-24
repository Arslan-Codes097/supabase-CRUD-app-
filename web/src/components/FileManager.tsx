'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Upload, Trash2, Download, RefreshCw, FileText, User, LogOut } from 'lucide-react'

type FileMeta = {
  id: string
  filename: string
  size: number
  content_type: string
  storage_path: string
  created_at: string
  owner: string
}

export default function FileManager() {
  const [username, setUsername] = useState<string>('')
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [files, setFiles] = useState<FileMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const BUCKET_NAME = 'user-files'

  const fetchFiles = useCallback(async () => {
    if (!username) return
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('file_metadata')
      .select('*')
      .eq('owner', username)
      .order('created_at', { ascending: false })

    if (error) {
      setError(error.message)
    } else {
      setFiles(data || [])
    }
    setLoading(false)
  }, [username])

  useEffect(() => {
    if (isLoggedIn) {
      fetchFiles()
    }
  }, [isLoggedIn, fetchFiles])

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    if (username.trim().length > 0) {
      setIsLoggedIn(true)
    }
  }

  const handleLogout = () => {
    setIsLoggedIn(false)
    setUsername('')
    setFiles([])
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setError(null)

    try {
      const storage_path = `${crypto.randomUUID()}_${file.name}`
      const content_type = file.type || 'application/octet-stream'

      // 1. Upload to Storage
      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(storage_path, file, { contentType: content_type })

      if (uploadError) throw uploadError

      // 2. Insert Metadata
      const { data: dbData, error: dbError } = await supabase
        .from('file_metadata')
        .insert({
          filename: file.name,
          size: file.size,
          content_type,
          storage_path,
          owner: username
        })
        .select()
        .single()

      if (dbError) throw dbError

      // 3. Trigger Validation Edge Function
      const { data: funcData, error: funcError } = await supabase.functions.invoke(
        'validate-file',
        {
          body: { file_id: dbData.id, storage_path },
        }
      )

      if (funcError) {
         console.warn("Edge Function call failed (maybe not deployed?). Error:", funcError.message)
      } else if (funcData?.success === false) {
         throw new Error(funcData.message)
      }

      await fetchFiles()
    } catch (err: any) {
      setError(err.message || 'Failed to upload file')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const handleDelete = async (id: string, storage_path: string) => {
    if (!confirm('Are you sure you want to delete this file?')) return
    
    setLoading(true)
    try {
      await supabase.storage.from(BUCKET_NAME).remove([storage_path])
      await supabase.from('file_metadata').delete().eq('id', id)
      await fetchFiles()
    } catch (err: any) {
      setError(err.message || 'Failed to delete file')
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = async (storage_path: string, filename: string) => {
    try {
      const { data, error } = await supabase.storage.from(BUCKET_NAME).download(storage_path)
      if (error) throw error

      const url = window.URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (err: any) {
      setError(err.message || 'Failed to download file')
    }
  }

  const handleUpdate = async (id: string, old_storage_path: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    setError(null)
    
    try {
      const storage_path = `${crypto.randomUUID()}_${file.name}`
      const content_type = file.type || 'application/octet-stream'

      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(storage_path, file, { contentType: content_type })

      if (uploadError) throw uploadError

      const { error: dbError } = await supabase
        .from('file_metadata')
        .update({
          filename: file.name,
          size: file.size,
          content_type,
          storage_path,
        })
        .eq('id', id)

      if (dbError) throw dbError

      await supabase.storage.from(BUCKET_NAME).remove([old_storage_path])
      await fetchFiles()
    } catch (err: any) {
      setError(err.message || 'Failed to update file')
    } finally {
      setLoading(false)
      e.target.value = ''
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  if (!isLoggedIn) {
    return (
      <div className="w-full max-w-md mx-auto p-8 bg-zinc-900/50 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10 mt-20 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500"></div>
        <div className="text-center mb-8">
          <div className="bg-white/5 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/10">
            <User className="text-blue-400" size={32} />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Welcome to FileVault</h2>
          <p className="text-zinc-400 text-sm">Enter a unique username to access your secure space.</p>
        </div>
        
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. alex_dev"
              className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all"
              required
            />
          </div>
          <button 
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl transition-all shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_25px_rgba(37,99,235,0.5)] active:scale-[0.98]"
          >
            Enter Vault
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="w-full max-w-5xl mx-auto p-6 md:p-8 bg-zinc-900/50 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10 mt-10">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 pb-6 border-b border-white/10 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="bg-blue-500/20 p-2 rounded-lg text-blue-400">
              <FileText size={24} />
            </div>
            Your Vault
          </h2>
          <p className="text-zinc-400 mt-1 text-sm flex items-center gap-2">
            Logged in as <span className="text-blue-400 font-medium px-2 py-0.5 bg-blue-500/10 rounded-md">{username}</span>
          </p>
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button 
            onClick={fetchFiles}
            className="p-2.5 text-zinc-400 hover:text-white hover:bg-white/10 rounded-xl transition-all active:scale-95"
            title="Refresh"
          >
            <RefreshCw size={20} className={loading && !uploading ? "animate-spin" : ""} />
          </button>
          
          <label className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600/90 hover:bg-blue-500 text-white font-medium rounded-xl cursor-pointer transition-all shadow-[0_0_20px_rgba(37,99,235,0.2)] hover:shadow-[0_0_25px_rgba(37,99,235,0.4)] active:scale-95">
            <Upload size={18} />
            {uploading ? 'Uploading...' : 'Upload File'}
            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>

          <button 
            onClick={handleLogout}
            className="p-2.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition-all active:scale-95 ml-2"
            title="Logout"
          >
            <LogOut size={20} />
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
          {error}
        </div>
      )}

      {/* File List */}
      <div className="overflow-x-auto rounded-xl border border-white/5 bg-black/20">
        <table className="w-full text-left border-collapse whitespace-nowrap">
          <thead>
            <tr className="border-b border-white/5 text-zinc-500 text-xs uppercase tracking-wider bg-black/40">
              <th className="p-4 font-semibold w-full">Filename</th>
              <th className="p-4 font-semibold">Size</th>
              <th className="p-4 font-semibold">Type</th>
              <th className="p-4 font-semibold">Uploaded</th>
              <th className="p-4 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {files.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-16 text-center text-zinc-500">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-2">
                      <FileText size={24} className="opacity-40" />
                    </div>
                    <p className="text-sm">Your vault is empty.</p>
                    <p className="text-xs opacity-60">Upload a file to get started.</p>
                  </div>
                </td>
              </tr>
            ) : (
              files.map((file) => (
                <tr key={file.id} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="p-4 font-medium text-zinc-200 max-w-[200px] md:max-w-[300px] truncate">
                    {file.filename}
                  </td>
                  <td className="p-4 text-zinc-400 text-sm">{formatSize(file.size)}</td>
                  <td className="p-4 text-zinc-400 text-sm max-w-[150px] truncate">
                    <span className="px-2 py-1 bg-white/5 rounded-md text-xs">{file.content_type || 'Unknown'}</span>
                  </td>
                  <td className="p-4 text-zinc-400 text-sm">
                    {new Date(file.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleDownload(file.storage_path, file.filename)}
                        className="p-2 text-zinc-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                        title="Download"
                      >
                        <Download size={18} />
                      </button>
                      
                      <label className="p-2 text-zinc-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors cursor-pointer" title="Replace File">
                        <RefreshCw size={18} />
                        <input type="file" className="hidden" onChange={(e) => handleUpdate(file.id, file.storage_path, e)} />
                      </label>

                      <button 
                        onClick={() => handleDelete(file.id, file.storage_path)}
                        className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
