"use client"

import { useEffect, useState } from "react"
import { createClient } from "@supabase/supabase-js"
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"

// 🔥 Init Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// 🔒 Type data biar aman
type FireData = {
  name: number
  flame: number
}

export default function ChartSensor() {
  const [data, setData] = useState<FireData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data, error } = await supabase
          .from("fire_logs")
          .select("flame, created_at")
          .order("created_at", { ascending: false })
          .limit(10)

        if (error) {
          console.error("Error fetch:", error.message)
          return
        }

        const formatted = data.map((d, i) => ({
          name: i + 1,
          flame: d.flame ? 1 : 0
        }))

        setData(formatted.reverse())
      } catch (err) {
        console.error("Unexpected error:", err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  return (
    <div className="bg-white/60 backdrop-blur p-4 rounded-2xl shadow mt-6">
      <h2 className="mb-3 font-semibold">Grafik Sensor</h2>

      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data}>
            <XAxis dataKey="name" />
            <YAxis domain={[0, 1]} />
            <Tooltip />
            <Line type="monotone" dataKey="flame" />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}