// lib/webrtc-direct.js
// Direct WebRTC (no signaling server): manual copy/paste of SDP.
// Star topology: Host <-> each Guest (DataChannel only).

const ICE = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" }, // You can add TURN later if needed
  ],
};

export class DirectHost {
  constructor({ onPeerOpen, onPeerClose, onMessage, onLog }) {
    this.onPeerOpen = onPeerOpen || (() => {});
    this.onPeerClose = onPeerClose || (() => {});
    this.onMessage  = onMessage || (() => {});
    this.onLog = onLog || (() => {});
    this.peers = new Map(); // peerId -> { pc, dc }
    this.counter = 0;
  }

  log(...a) { try { this.onLog?.(...a); } catch {} }

  async createInvite() {
    console.log("Creating invite...");
    const peerId = `p${++this.counter}`;
    console.log("Generated peerId:", peerId);
    
    const pc = new RTCPeerConnection(ICE);
    const dc = pc.createDataChannel("mleo");
    const entry = { pc, dc, peerId };
    this.peers.set(peerId, entry);

    dc.onopen  = () => {
      console.log("Data channel opened for", peerId);
      this.onPeerOpen(peerId);
    };
    dc.onclose = () => { 
      console.log("Data channel closed for", peerId);
      this.onPeerClose(peerId); 
      this.peers.delete(peerId); 
    };
    dc.onmessage = (e) => this.onMessage(peerId, e.data);

    // Don't set ice candidates handler - we'll wait for complete
    console.log("Creating offer...");
    const offer = await pc.createOffer({ iceRestart: false });
    console.log("Setting local description...");
    await pc.setLocalDescription(offer);
    console.log("Local description set, signaling state:", pc.signalingState);

    // Wait for ICE gathering to complete
    console.log("Waiting for ICE gathering...");
    await new Promise((resolve, reject) => {
      if (pc.iceGatheringState === "complete") {
        console.log("ICE gathering already complete");
        resolve();
        return;
      }
      
      const timeout = setTimeout(() => {
        console.warn("ICE gathering timeout, proceeding anyway");
        resolve();
      }, 5000);
      
      const checkState = () => {
        console.log("ICE gathering state changed to:", pc.iceGatheringState);
        if (pc.iceGatheringState === "complete") {
          clearTimeout(timeout);
          resolve();
        }
      };
      
      pc.addEventListener("icegatheringstatechange", checkState);
    });

    const invite = {
      v: 1, role: "host", peerId,
      sdp: pc.localDescription.sdp,
      type: pc.localDescription.type,
    };
    console.log("Invite created for peerId:", peerId);
    return b64(JSON.stringify(invite));
  }

  async acceptAnswer(answerB64) {
    console.log("Accepting answer...");
    const ans = JSON.parse(atobUrl(answerB64));
    console.log("Answer peerId:", ans.peerId);
    
    const entry = this.peers.get(ans.peerId);
    if (!entry) {
      console.error("Unknown peer:", ans.peerId);
      throw new Error("Unknown peer");
    }
    
    console.log("Current signaling state:", entry.pc.signalingState);
    
    // Check if we're in the right state
    if (entry.pc.signalingState !== "have-local-offer") {
      console.warn("Wrong signaling state:", entry.pc.signalingState);
      // Try to reset the connection
      console.log("Resetting connection...");
      entry.pc.close();
      this.peers.delete(ans.peerId);
      return false;
    }
    
    try {
      await entry.pc.setRemoteDescription({ type: "answer", sdp: ans.sdp });
      console.log("Answer accepted successfully");
      return true;
    } catch (error) {
      console.error("Error setting remote description:", error);
      // Try to reset the connection
      console.log("Resetting connection due to error...");
      entry.pc.close();
      this.peers.delete(ans.peerId);
      throw error;
    }
  }

  send(peerId, data) {
    const entry = this.peers.get(peerId);
    if (entry?.dc?.readyState === "open") entry.dc.send(toWire(data));
  }

  broadcast(data) {
    for (const { dc } of this.peers.values()) {
      if (dc.readyState === "open") dc.send(toWire(data));
    }
  }

  closePeer(peerId) { this.peers.get(peerId)?.pc?.close(); this.peers.delete(peerId); }
  closeAll() { for (const p of this.peers.values()) p.pc.close(); this.peers.clear(); }
}

export class DirectGuest {
  constructor({ onOpen, onClose, onMessage, onLog }) {
    this.onOpen = onOpen || (() => {});
    this.onClose = onClose || (() => {});
    this.onMessage = onMessage || (() => {});
    this.onLog = onLog || (() => {});
    this.pc = null;
    this.dc = null;
    this.peerId = `g${Math.random().toString(16).slice(2,8)}`;
  }
  log(...a) { try { this.onLog?.(...a); } catch {} }

  async joinFromInvite(inviteB64) {
    console.log("Joining from invite...");
    const inv = JSON.parse(atobUrl(inviteB64));
    console.log("Invite role:", inv.role, "peerId:", inv.peerId);
    
    if (inv.role !== "host") throw new Error("Not a host invite");

    const pc = new RTCPeerConnection(ICE);
    this.pc = pc;

    pc.ondatachannel = (ev) => {
      console.log("Data channel received");
      this.dc = ev.channel;
      this.dc.onopen = () => {
        console.log("Data channel opened");
        this.onOpen();
      };
      this.dc.onclose = () => {
        console.log("Data channel closed");
        this.onClose();
      };
      this.dc.onmessage = (e) => this.onMessage(e.data);
    };

    // Set remote description first
    console.log("Setting remote description...");
    await pc.setRemoteDescription({ type: "offer", sdp: inv.sdp });
    console.log("Remote description set, signaling state:", pc.signalingState);
    
    // Create answer
    console.log("Creating answer...");
    const answer = await pc.createAnswer();
    console.log("Setting local description...");
    await pc.setLocalDescription(answer);
    console.log("Local description set, signaling state:", pc.signalingState);

    // Wait for ICE gathering to complete
    console.log("Waiting for ICE gathering...");
    await new Promise((resolve) => {
      if (pc.iceGatheringState === "complete") {
        console.log("ICE gathering already complete");
        resolve();
        return;
      }
      
      const timeout = setTimeout(() => {
        console.warn("ICE gathering timeout, proceeding anyway");
        resolve();
      }, 5000);
      
      const checkState = () => {
        console.log("ICE gathering state changed to:", pc.iceGatheringState);
        if (pc.iceGatheringState === "complete") {
          clearTimeout(timeout);
          resolve();
        }
      };
      
      pc.addEventListener("icegatheringstatechange", checkState);
    });

    const ans = {
      v: 1, role: "guest", peerId: inv.peerId,
      sdp: pc.localDescription.sdp,
      type: pc.localDescription.type,
    };
    console.log("Answer created for peerId:", inv.peerId);
    return b64(JSON.stringify(ans));
  }

  send(data) { if (this.dc?.readyState === "open") this.dc.send(toWire(data)); }
  close() { this.pc?.close(); }
}

// helpers
function toWire(x){ return typeof x === "string" ? x : JSON.stringify(x); }
function toB64Url(s){ return s.replaceAll("+","-").replaceAll("/","_").replaceAll("=",""); }
function b64(s){ return toB64Url(btoa(s)); }
function atobUrl(s){ s = s.replaceAll("-","+").replaceAll("_","/"); while(s.length%4) s+="="; return atob(s); }
