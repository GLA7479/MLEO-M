// ============================================================================
// Multiplayer Engine - PeerJS Integration
// Handles room creation, joining, and real-time sync
// ============================================================================

import Peer from 'peerjs';

export class MultiplayerEngine {
  constructor() {
    this.peer = null;
    this.connections = [];
    this.isHost = false;
    this.roomCode = null;
    this.playerId = null;
    this.players = [];
    this.gameState = null;
    this.onStateUpdate = null;
    this.onPlayerJoin = null;
    this.onPlayerLeave = null;
    this.onError = null;
  }

  // Generate random 5-character room code
  generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  // Create a new game room (HOST)
  async createRoom(playerName, maxPlayers = 4) {
    return new Promise((resolve, reject) => {
      try {
        this.peer = new Peer();
        this.isHost = true;

        this.peer.on('open', (id) => {
          this.playerId = id;
          this.roomCode = this.generateRoomCode();
          
          // Initialize host as first player
          this.players = [{
            id: this.playerId,
            name: playerName,
            isHost: true,
            chips: 10000,
            status: 'ready'
          }];

          this.gameState = {
            roomCode: this.roomCode,
            maxPlayers,
            players: this.players,
            status: 'waiting',
            hostId: this.playerId
          };

          // Listen for incoming connections
          this.peer.on('connection', (conn) => {
            this.handleConnection(conn);
          });

          resolve({
            success: true,
            roomCode: this.roomCode,
            playerId: this.playerId
          });
        });

        this.peer.on('error', (err) => {
          console.error('PeerJS Error:', err);
          if (this.onError) this.onError(err);
          reject(err);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  // Join an existing game room
  async joinRoom(roomCode, playerName) {
    return new Promise((resolve, reject) => {
      try {
        this.peer = new Peer();
        this.isHost = false;
        this.roomCode = roomCode;

        this.peer.on('open', (id) => {
          this.playerId = id;

          // Connect to host (we'll use a public PeerJS server discovery)
          // In production, you'd need a signaling server to map room codes to peer IDs
          // For now, we'll use the room code as the peer ID hint
          
          const conn = this.peer.connect(roomCode);

          conn.on('open', () => {
            // Send join request
            conn.send({
              type: 'join',
              playerId: this.playerId,
              playerName: playerName
            });

            this.connections.push(conn);
            this.setupConnectionHandlers(conn);

            resolve({
              success: true,
              playerId: this.playerId
            });
          });

          conn.on('error', (err) => {
            console.error('Connection Error:', err);
            if (this.onError) this.onError(err);
            reject(err);
          });
        });

        this.peer.on('error', (err) => {
          console.error('PeerJS Error:', err);
          if (this.onError) this.onError(err);
          reject(err);
        });

      } catch (error) {
        reject(error);
      }
    });
  }

  // Handle incoming connection (HOST only)
  handleConnection(conn) {
    if (!this.isHost) return;

    conn.on('data', (data) => {
      if (data.type === 'join') {
        // Add new player
        const newPlayer = {
          id: data.playerId,
          name: data.playerName,
          isHost: false,
          chips: 10000,
          status: 'ready'
        };

        // Check if room is full
        if (this.players.length >= this.gameState.maxPlayers) {
          conn.send({
            type: 'error',
            message: 'Room is full'
          });
          conn.close();
          return;
        }

        this.players.push(newPlayer);
        this.connections.push(conn);
        this.setupConnectionHandlers(conn);

        // Update game state
        this.gameState.players = this.players;

        // Notify new player
        conn.send({
          type: 'joined',
          gameState: this.gameState,
          yourId: data.playerId
        });

        // Broadcast to all players
        this.broadcast({
          type: 'player_joined',
          player: newPlayer,
          gameState: this.gameState
        });

        if (this.onPlayerJoin) {
          this.onPlayerJoin(newPlayer);
        }
      } else {
        this.handleGameMessage(data, conn);
      }
    });

    conn.on('close', () => {
      this.handlePlayerDisconnect(conn);
    });
  }

  // Setup connection message handlers
  setupConnectionHandlers(conn) {
    conn.on('data', (data) => {
      this.handleGameMessage(data, conn);
    });

    conn.on('close', () => {
      this.handlePlayerDisconnect(conn);
    });
  }

  // Handle game messages
  handleGameMessage(data, conn) {
    if (data.type === 'state_update' && this.isHost) {
      // Host receives action from player
      this.gameState = { ...this.gameState, ...data.updates };
      this.broadcast({
        type: 'state_sync',
        gameState: this.gameState
      });
      if (this.onStateUpdate) {
        this.onStateUpdate(this.gameState);
      }
    } else if (data.type === 'state_sync' && !this.isHost) {
      // Player receives state from host
      this.gameState = data.gameState;
      if (this.onStateUpdate) {
        this.onStateUpdate(this.gameState);
      }
    } else if (data.type === 'joined' && !this.isHost) {
      // Player receives confirmation of joining
      this.gameState = data.gameState;
      this.playerId = data.yourId;
      if (this.onStateUpdate) {
        this.onStateUpdate(this.gameState);
      }
    } else if (data.type === 'player_joined') {
      // All players notified of new player
      this.gameState = data.gameState;
      if (this.onPlayerJoin) {
        this.onPlayerJoin(data.player);
      }
      if (this.onStateUpdate) {
        this.onStateUpdate(this.gameState);
      }
    }
  }

  // Handle player disconnect
  handlePlayerDisconnect(conn) {
    const index = this.connections.indexOf(conn);
    if (index > -1) {
      this.connections.splice(index, 1);
    }

    // Find and remove player
    const playerId = conn.peer;
    const playerIndex = this.players.findIndex(p => p.id === playerId);
    
    if (playerIndex > -1) {
      const player = this.players[playerIndex];
      this.players.splice(playerIndex, 1);

      if (this.isHost) {
        this.gameState.players = this.players;
        this.broadcast({
          type: 'player_left',
          playerId: playerId,
          gameState: this.gameState
        });
      }

      if (this.onPlayerLeave) {
        this.onPlayerLeave(player);
      }
    }
  }

  // Broadcast message to all connected players (HOST only)
  broadcast(message, excludeId = null) {
    if (!this.isHost) return;

    this.connections.forEach(conn => {
      if (conn.open && conn.peer !== excludeId) {
        try {
          conn.send(message);
        } catch (err) {
          console.error('Broadcast error:', err);
        }
      }
    });
  }

  // Send message to host (PLAYER only)
  sendToHost(message) {
    if (this.isHost) return;

    const hostConnection = this.connections[0];
    if (hostConnection && hostConnection.open) {
      try {
        hostConnection.send(message);
      } catch (err) {
        console.error('Send to host error:', err);
      }
    }
  }

  // Update game state (call from host or send to host)
  updateGameState(updates) {
    if (this.isHost) {
      this.gameState = { ...this.gameState, ...updates };
      this.broadcast({
        type: 'state_sync',
        gameState: this.gameState
      });
      if (this.onStateUpdate) {
        this.onStateUpdate(this.gameState);
      }
    } else {
      this.sendToHost({
        type: 'state_update',
        updates: updates
      });
    }
  }

  // Disconnect and cleanup
  disconnect() {
    this.connections.forEach(conn => {
      try {
        conn.close();
      } catch (err) {
        console.error('Error closing connection:', err);
      }
    });

    if (this.peer) {
      try {
        this.peer.destroy();
      } catch (err) {
        console.error('Error destroying peer:', err);
      }
    }

    this.connections = [];
    this.peer = null;
    this.gameState = null;
  }
}

export default MultiplayerEngine;

