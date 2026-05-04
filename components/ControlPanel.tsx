"use client"

export default function ControlPanel() {

  async function updateControl(data: any) {
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/control?id=eq.1`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "apikey": process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        "Authorization": `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify(data)
    })
  }

  return (
    <div className="mt-6 space-y-3">

      <button 
        onClick={() => updateControl({ relay: true })}
        className="w-full bg-black text-white py-3 rounded-xl shadow-lg">
        Nyalakan Pompa
      </button>

      <button 
        onClick={() => updateControl({ relay: false })}
        className="w-full bg-gray-200 py-3 rounded-xl shadow">
        Matikan Pompa
      </button>

      <button 
        onClick={() => updateControl({ mode: "auto" })}
        className="w-full bg-blue-500 text-white py-3 rounded-xl shadow-lg">
        Mode AUTO
      </button>

      <button 
        onClick={() => updateControl({ mode: "manual" })}
        className="w-full bg-yellow-400 py-3 rounded-xl shadow">
        Mode MANUAL
      </button>

      <input
        type="range"
        min="0"
        max="180"
        className="w-full"
        onChange={(e) => updateControl({ angle: parseInt(e.target.value) })}
        />

    </div>
  )
}