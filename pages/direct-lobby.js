import { useState } from "react";
import { DirectHost, DirectGuest } from "../lib/webrtc-direct";

export default function DirectLobby() {
  const [mode, setMode] = useState("host"); // host | guest
  const [invite, setInvite] = useState("");
  const [answer, setAnswer] = useState("");
  const [host, setHost] = useState(null);
  const [guest, setGuest] = useState(null);
  const [players, setPlayers] = useState([]);
  const [log, setLog] = useState("");

  const appendLog = (...a) => setLog(l => l + (l ? "\n" : "") + a.join(" "));

  async function createInvite() {
    const h = new DirectHost({
      onPeerOpen: (peerId) => { setPlayers(p => [...p, peerId]); appendLog("open", peerId); },
      onPeerClose: (peerId) => { setPlayers(p => p.filter(x => x !== peerId)); appendLog("close", peerId); },
      onMessage: (_peerId, data) => appendLog("msg", data),
      onLog: appendLog,
    });
    setHost(h);
    const off = await h.createInvite();
    setInvite(off);
  }

  async function finalizeAnswer() {
    if (!host || !answer) return;
    await host.acceptAnswer(answer);
    setAnswer("");
    appendLog("finalized");
  }

  async function joinFromInvite() {
    const g = new DirectGuest({
      onOpen: () => appendLog("guest open"),
      onClose: () => appendLog("guest close"),
      onMessage: (data) => appendLog("msg", data),
      onLog: appendLog,
    });
    setGuest(g);
    const ans = await g.joinFromInvite(invite);
    setAnswer(ans); // send back to host
  }

  function demoSend() {
    if (host) host.broadcast({ type: "ping", t: Date.now() });
    if (guest) guest.send({ type: "pong", t: Date.now() });
  }

  return (
    <div style={{maxWidth: 920, margin: "40px auto", fontFamily: "system-ui", color: "#eee", background: "#111", padding: "20px", borderRadius: "10px"}}>
      <h1>🎮 Direct Lobby (No Server)</h1>
      <p style={{color: "#888", marginBottom: "20px"}}>WebRTC P2P connection without external servers</p>

      <div style={{marginTop: 10}}>
        <button 
          onClick={() => setMode("host")} 
          disabled={mode==="host"}
          style={{
            padding: "10px 20px",
            marginRight: "8px",
            background: mode==="host" ? "#4CAF50" : "#333",
            color: "white",
            border: "none",
            borderRadius: "5px",
            cursor: mode==="host" ? "default" : "pointer"
          }}
        >
          Host
        </button>
        <button 
          onClick={() => setMode("guest")} 
          disabled={mode==="guest"}
          style={{
            padding: "10px 20px",
            background: mode==="guest" ? "#4CAF50" : "#333",
            color: "white",
            border: "none",
            borderRadius: "5px",
            cursor: mode==="guest" ? "default" : "pointer"
          }}
        >
          Guest
        </button>
      </div>

      {mode==="host" ? (
        <div style={{marginTop: 20}}>
          <button 
            onClick={createInvite}
            style={{
              padding: "12px 24px",
              background: "#2196F3",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer",
              fontSize: "16px"
            }}
          >
            Create Invite (Offer)
          </button>
          <div style={{marginTop: 8, fontSize: 12, opacity: .8}}>Copy to guest:</div>
          <textarea 
            value={invite} 
            readOnly 
            rows={6} 
            style={{
              width: "100%", 
              background: "#222", 
              color: "#fff", 
              border: "1px solid #444", 
              borderRadius: "5px", 
              padding: "10px",
              fontFamily: "monospace",
              fontSize: "12px"
            }} 
          />
          <div style={{marginTop: 8, fontSize: 12, opacity: .8}}>Paste guest Answer here:</div>
          <textarea 
            value={answer} 
            onChange={e=>setAnswer(e.target.value)} 
            rows={6} 
            style={{
              width: "100%", 
              background: "#222", 
              color: "#fff", 
              border: "1px solid #444", 
              borderRadius: "5px", 
              padding: "10px",
              fontFamily: "monospace",
              fontSize: "12px"
            }} 
          />
          <button 
            onClick={finalizeAnswer} 
            style={{
              marginTop: 8,
              padding: "10px 20px",
              background: "#4CAF50",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer"
            }}
          >
            Finalize Peer
          </button>
        </div>
      ) : (
        <div style={{marginTop: 20}}>
          <div style={{fontSize: 12, opacity: .8}}>Paste host Invite (Offer):</div>
          <textarea 
            value={invite} 
            onChange={e=>setInvite(e.target.value)} 
            rows={6} 
            style={{
              width: "100%", 
              background: "#222", 
              color: "#fff", 
              border: "1px solid #444", 
              borderRadius: "5px", 
              padding: "10px",
              fontFamily: "monospace",
              fontSize: "12px"
            }} 
          />
          <button 
            onClick={joinFromInvite} 
            style={{
              marginTop: 8,
              padding: "12px 24px",
              background: "#FF9800",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer",
              fontSize: "16px"
            }}
          >
            Join & Produce Answer
          </button>
          <div style={{marginTop: 8, fontSize: 12, opacity: .8}}>Send this back to host:</div>
          <textarea 
            value={answer} 
            readOnly 
            rows={6} 
            style={{
              width: "100%", 
              background: "#222", 
              color: "#fff", 
              border: "1px solid #444", 
              borderRadius: "5px", 
              padding: "10px",
              fontFamily: "monospace",
              fontSize: "12px"
            }} 
          />
        </div>
      )}

      <div style={{marginTop: 20}}>
        <button 
          onClick={demoSend}
          style={{
            padding: "10px 20px",
            background: "#9C27B0",
            color: "white",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer"
          }}
        >
          Demo Send
        </button>
        <div style={{marginTop: 8, fontSize: 14}}>Players: {players.join(", ") || "—"}</div>
        <pre style={{
          marginTop: 8, 
          background: "#000", 
          padding: 12, 
          maxHeight: 220, 
          overflow: "auto", 
          fontSize: 12, 
          whiteSpace: "pre-wrap",
          borderRadius: "5px",
          border: "1px solid #333"
        }}>
          {log}
        </pre>
      </div>
    </div>
  );
}
