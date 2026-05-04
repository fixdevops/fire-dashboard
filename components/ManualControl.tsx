"use client"

import { createClient } from "@supabase/supabase-js"
import { useState } from "react"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function ManualControl() {
  const [relay, setRelay] = useState(false)
  const [angle, setAngle] = useState(90)
  const [mode, setMode] = useState("auto")

  async function update(data: any) {
    await supabase
      .from("control")
      .update(data)
      .eq("id", 1)
  }

  return (
    <div className="space-y-4">

      {/* MODE */}
      <div className="flex justify-between items-center">
        <span>Mode</span>
        <button
          onClick={() => {
            const m = mode === "auto" ? "manual" : "auto"
            setMode(m)
            update({ mode: m })
          }}
          className="px-3 py-1 bg-gray-200 rounded-lg"
        >
          {mode.toUpperCase()}
        </button>
      </div>

      {/* RELAY */}
      <div className="flex justify-between items-center">
        <span>Water Pump</span>
        <button
          onClick={() => {
            setRelay(!relay)
            update({ relay: !relay })
          }}
          className={`w-12 h-6 rounded-full flex items-center px-1 ${
            relay ? "bg-green-400" : "bg-gray-300"
          }`}
        >
          <div className={`w-4 h-4 bg-white rounded-full ${
            relay ? "translate-x-6" : ""
          }`} />
        </button>
      </div>

      {/* SERVO */}
      <div>
        <span>Servo Angle</span>
        <input
          type="range"
          min="0"
          max="180"
          value={angle}
          onChange={(e) => {
            const val = Number(e.target.value)
            setAngle(val)
            update({ target_angle: val })
          }}
          className="w-full"
        />
      </div>

    </div>
  )
}