import FileManager from '@/components/FileManager'

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white font-sans selection:bg-blue-500/30 relative overflow-hidden">
      
      {/* Background gradients */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-900/20 blur-[120px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-900/20 blur-[120px] rounded-full pointer-events-none"></div>

      <div className="relative max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-6">
          <h1 className="text-5xl md:text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-zinc-400 tracking-tight mb-4">
            FileVault
          </h1>
          <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
            Secure, user-segregated file storage powered by Supabase Edge Validation.
          </p>
        </div>
        
        <FileManager />
      </div>
    </main>
  )
}
