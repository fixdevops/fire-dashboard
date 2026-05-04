"use client"

import { useEffect, useState, useRef } from "react"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default function Page() {
  const [alarmPlayed, setAlarmPlayed] = useState(false)
  const [angle, setAngle] = useState(90)
  const [relay, setRelay] = useState(false)
  const [fire, setFire] = useState(false)

  // 🔊 AUDIO FIX (ANTI BUG)
  const alarmRef = useRef<HTMLAudioElement | null>(null)

  // 🔥 TAMBAHAN (TIDAK MENGUBAH UI)
  const updateControl = async (data: any) => {
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/control?id=eq.1`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "apikey": process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        "Authorization": `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({
        ...data,
        updated_at: new Date().toISOString()
      })
    })
  }

  useEffect(() => {

    let channel: any

    // 🔊 INIT AUDIO
    if (!alarmRef.current) {
      alarmRef.current = new Audio("/apiapi.mp3")
      alarmRef.current.loop = true
    }

    // 🔔 REQUEST NOTIF
    if ("Notification" in window && Notification.permission !== "granted") {
      Notification.requestPermission()
    }

    const fetchInitialData = async () => {
      const { data, error } = await supabase
        .from("fire_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)

      if (error) {
        console.log("INIT ERROR:", error)
        return
      }

      const d = data?.[0]
      if (d) {
        setAngle(d.angle ?? 90)
        setRelay(d.relay ?? false)
        setFire(d.flame ?? false)
      }
    }

    fetchInitialData()

    const handleRealtime = (payload: any) => {
      console.log("REALTIME:", payload)

      const d = payload.new || payload.old
      if (!d) return

      setAngle(d.angle ?? 90)
      setRelay(d.relay ?? false)
      setFire(d.flame ?? false)
    }

    channel = supabase
      .channel("fire-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "fire_logs"
        },
        handleRealtime
      )
      .subscribe((status) => {
        console.log("STATUS:", status)
      })

    return () => {
      if (channel) {
        supabase.removeChannel(channel)
      }
    }

  }, [])

  // 🔥 NOTIF + ALARM
  useEffect(() => {
    if (fire && !alarmPlayed) {

      // 🔊 bunyi
      alarmRef.current?.play().catch(() => {})

      // 🔔 notif
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("🔥 FIRE DETECTED!", {
          body: "Sensor mendeteksi api! Sistem aktif!",
        })
      }

      setAlarmPlayed(true)
    }

    if (!fire) {
      setAlarmPlayed(false)

      // 🔇 stop alarm
      alarmRef.current?.pause()
      if (alarmRef.current) alarmRef.current.currentTime = 0
    }
  }, [fire])

  return (
    <main className="min-h-screen bg-[#eef1f5] p-4 md:p-8 text-gray-700">

      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-3">
        <h1 className="text-base md:text-lg font-semibold">
          Fire Fighter System Monitor
        </h1>

        <div className="px-3 py-1 bg-green-100 text-green-600 rounded-full text-xs md:text-sm shadow-inner">
          ✔ connected
        </div>
      </div>

      {/* GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">

        {/* SERVO */}
        <div className="md:col-span-2 bg-[#eef1f5] rounded-2xl p-4 md:p-6 shadow-[8px_8px_16px_#d1d5db,-8px_-8px_16px_#ffffff]">

          <p className="text-xs md:text-sm mb-4 text-gray-500">Servo position</p>

          <div className="flex flex-col items-center justify-center">

            <div className="relative w-full max-w-[260px] h-40">

              <div className="absolute w-full h-full border-[12px] border-gray-300 rounded-full border-b-transparent border-l-transparent border-r-transparent"></div>

              <div
                className="absolute bottom-0 left-1/2 w-[3px] h-24 bg-blue-500 origin-bottom rounded-full transition-all duration-300"
                style={{
                  transform: `rotate(${angle - 90}deg)`
                }}
              />

              <div className="absolute bottom-0 left-1/2 w-4 h-4 bg-blue-500 rounded-full -translate-x-1/2"></div>
            </div>

            <p className="text-2xl md:text-3xl font-semibold mt-4">{angle}°</p>
          </div>
        </div>

        {/* RIGHT SIDE */}
        <div className="space-y-5">

          {/* FIRE ALERT */}
          <div className="relative rounded-2xl p-4 md:p-5 text-white bg-red-500 shadow-lg overflow-hidden">

            {fire && (
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute bottom-0 left-1/2 w-20 h-20 bg-orange-400 blur-2xl opacity-60 animate-pulse -translate-x-1/2"></div>
                <div className="absolute bottom-0 left-1/2 w-14 h-14 bg-yellow-300 blur-xl opacity-80 animate-ping -translate-x-1/2"></div>
              </div>
            )}

            <p className="text-xs md:text-sm opacity-80 mb-2">
              Fire Alert Panel
            </p>

            <p className="font-semibold relative z-10 text-sm md:text-base">
              🔥 FLAME DETECTED (Pin 34: LOW)
            </p>
          </div>

          {/* CONTROL */}
          <div className="bg-[#eef1f5] rounded-2xl p-4 md:p-5 shadow-[inset_6px_6px_10px_#d1d5db,inset_-6px_-6px_#ffffff]">

            <p className="text-xs md:text-sm text-gray-500 mb-4">
              Manual Override
            </p>

            <div className="flex justify-between items-center mb-4">
              <span className="text-sm">Water Pump</span>

              <button
                onClick={() => {
                  const val = !relay
                  setRelay(val)
                  updateControl({ relay: val, mode: "manual" })
                }}
                className={`w-12 h-6 rounded-full flex items-center px-1 transition ${
                  relay ? "bg-green-400" : "bg-gray-300"
                }`}
              >
                <div className={`w-4 h-4 bg-white rounded-full shadow transform transition ${
                  relay ? "translate-x-6" : ""
                }`} />
              </button>
            </div>

            <input
              type="range"
              min="0"
              max="180"
              value={angle}
              onChange={(e) => {
                const val = Number(e.target.value)
                setAngle(val)
                updateControl({ target_angle: val, mode: "manual" })
              }}
              className="w-full"
            />
          </div>

          {/* LED */}
          <div className="bg-[#eef1f5] rounded-2xl p-4 md:p-5 shadow-[8px_8px_16px_#d1d5db,-8px_-8px_16px_#ffffff] flex justify-between items-center">

            <span className="text-sm">LED Status</span>

            <div className="w-10 h-10 rounded-full bg-green-400 shadow-[inset_0_0_10px_rgba(0,0,0,0.4),0_0_20px_rgba(0,255,0,0.6)]"></div>
          </div>

        </div>

      </div>

      {/* LOG */}
      <div className="mt-6 bg-[#eef1f5] rounded-2xl p-4 md:p-5 shadow-[inset_6px_6px_10px_#d1d5db,inset_-6px_-6px_#ffffff]">

        <p className="text-xs md:text-sm text-gray-500 mb-2">Live Logs</p>

        <div className="text-xs md:text-sm space-y-1">
          <p>14:15:30 - System Initialized</p>
          <p>14:15:35 - Scanning (0° to 180°)</p>
          <p>14:15:40 - 🔥 API DETECTED at 125°</p>
          <p>14:15:41 - Pump and LED Activated</p>
        </div>

      </div>

    </main>
  )
}