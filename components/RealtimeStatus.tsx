"use client"

import { useEffect, useState } from "react"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function RealtimeStatus() {
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    // ambil awal
    supabase
      .from("fire_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .then(res => setData(res.data?.[0]))

    // realtime listener
    const channel = supabase
      .channel("realtime-fire")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "fire_logs" },
        payload => {
          setData(payload.new)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  return (
    <>
      <div className={`p-6 rounded-2xl backdrop-blur-lg mb-4 ${
        data?.flame ? "bg-red-200/70" : "bg-green-200/70"
      }`}>
        <p className="text-lg font-semibold">
          {data?.flame ? "🔥 API TERDETEKSI" : "✅ AMAN"}
        </p>
      </div>

      <div className="bg-white/60 backdrop-blur rounded-xl p-4 mb-2 shadow">
        Relay: {data?.relay ? "ON" : "OFF"}
      </div>

      <div className="bg-white/60 backdrop-blur rounded-xl p-4 shadow">
        Angle: {data?.angle}
      </div>
    </>
  )
}