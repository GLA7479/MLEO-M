// ============================================================================
// Tournament Engine - PeerJS Integration for Texas Hold'em Tournament
// Handles tournament creation, joining, and real-time sync
// ============================================================================

import Peer from 'peerjs';

export class TournamentEngine {
  constructor() {
    this.peer = null;
    this.connections = [];
    this.isHost = false;
    this.roomCode = null;
    this.playerId = null;
    this.players = [];
    this.tournamentState = null;
    this.onStateUpdate = null;
    this.onPlayerJoin = null;
    this.onPlayerLeave = null;
    this.onError = null;
    this.onMessage = null;
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

  // Create a new tournament (HOST)
  async createTournament(playerName, maxPlayers = 6, startingChips = 10000, tournamentName = "Texas Hold'em Tournament") {
    return new Promise((resolve, reject) => {
      try {
        this.roomCode = this.generateRoomCode();
        this.peer = new Peer(this.roomCode, {
          host: '0.peerjs.com',
          port: 443,
          path: '/',
          secure: true,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:stun2.l.google.com:19302' },
              { urls: 'stun:stun3.l.google.com:19302' }
            ]
          }
        });

        this.peer.on('open', (id) => {
          console.log('Host peer opened with ID:', id);
          this.isHost = true;
          this.playerId = id;
          
          this.players = [{
            id: this.playerId,
            name: playerName,
            isHost: true,
            chips: startingChips,
            status: 'ready',
            eliminated: false,
            position: 0
          }];

          this.tournamentState = {
            roomCode: this.roomCode,
            tournamentName,
            maxPlayers,
            startingChips,
            players: this.players,
            status: 'waiting', // waiting, playing, finished
            currentGame: null,
            gameHistory: [],
            eliminatedPlayers: [],
            currentRound: 0,
            hostId: this.playerId
          };

          resolve({
            playerId: this.playerId,
            roomCode: this.roomCode,
            tournamentState: this.tournamentState
          });
        });

        this.peer.on('connection', (conn) => {
          this.handleConnection(conn);
        });

        this.peer.on('error', (err) => {
          console.error('Host peer error:', err);
          reject(err);
        });

        // Timeout after 10 seconds
        setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 10000);

      } catch (error) {
        reject(error);
      }
    });
  }

  // Join existing tournament (PLAYER)
  async joinTournament(playerName, roomCode) {
    return new Promise((resolve, reject) => {
      try {
        this.roomCode = roomCode;
        this.peer = new Peer({
          host: '0.peerjs.com',
          port: 443,
          path: '/',
          secure: true,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:stun2.l.google.com:19302' },
              { urls: 'stun:stun3.l.google.com:19302' }
            ]
          }
        });

        this.peer.on('open', (id) => {
          console.log('Player peer opened with ID:', id);
          this.playerId = id;
          this.isHost = false;

          // Try to connect to host
          this.connectToHost(playerName, roomCode, resolve, reject);
        });

        this.peer.on('error', (err) => {
          console.error('Player peer error:', err);
          reject(err);
        });

        // Timeout after 10 seconds
        setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 10000);

      } catch (error) {
        reject(error);
      }
    });
  }

  // Connect to host with retry mechanism
  async connectToHost(playerName, roomCode, resolve, reject) {
    const servers = ['0.peerjs.com', 'peerjs-server.herokuapp.com', 'peerjs.com'];
    let retryCount = 0;
    const maxRetries = 3;

    const tryConnect = () => {
      if (retryCount >= maxRetries) {
        reject(new Error('Could not connect to tournament after multiple attempts'));
        return;
      }

      const server = servers[retryCount % servers.length];
      console.log(`Attempting to connect to ${server} (attempt ${retryCount + 1})`);

      try {
        const conn = this.peer.connect(roomCode, {
          host: server,
          port: 443,
          path: '/',
          secure: true
        });

        conn.on('open', () => {
          console.log('Connected to host successfully');
          this.connections.push(conn);
          this.setupConnectionHandlers(conn);
          
          // Send join request
          conn.send({
            type: 'join',
            playerId: this.playerId,
            playerName: playerName
          });
        });

        conn.on('error', (err) => {
          console.error(`Connection attempt ${retryCount + 1} failed:`, err);
          retryCount++;
          setTimeout(tryConnect, 2000);
        });

        conn.on('close', () => {
          console.log('Connection closed');
        });

      } catch (error) {
        console.error(`Connection attempt ${retryCount + 1} failed:`, error);
        retryCount++;
        setTimeout(tryConnect, 2000);
      }
    };

    tryConnect();
  }

  // Handle incoming connections (HOST only)
  handleConnection(conn) {
    if (!this.isHost) return;

    conn.on('data', (data) => {
      if (data.type === 'join') {
        // Add new player
        const newPlayer = {
          id: data.playerId,
          name: data.playerName,
          isHost: false,
          chips: this.tournamentState.startingChips,
          status: 'ready',
          eliminated: false,
          position: 0
        };

        // Check if tournament is full
        if (this.players.length >= this.tournamentState.maxPlayers) {
          conn.send({
            type: 'error',
            message: 'Tournament is full'
          });
          conn.close();
          return;
        }

        this.players.push(newPlayer);
        this.connections.push(conn);
        this.setupConnectionHandlers(conn);

        // Update tournament state
        this.tournamentState.players = this.players;

        // Notify new player
        conn.send({
          type: 'joined',
          tournamentState: this.tournamentState,
          yourId: data.playerId
        });

        // Broadcast to all players
        this.broadcast({
          type: 'player_joined',
          player: newPlayer,
          tournamentState: this.tournamentState
        });

        if (this.onPlayerJoin) {
          this.onPlayerJoin(newPlayer);
        }

        // Update state for host
        if (this.onStateUpdate) {
          this.onStateUpdate(this.tournamentState);
        }
      }
    });
  }

  // Setup connection handlers
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
    console.log("Handling tournament message:", data.type, "from:", conn.peer);
    
    if (data.type === 'state_update' && this.isHost) {
      // Host receives action from player
      this.tournamentState = { ...this.tournamentState, ...data.updates };
      this.broadcast({
        type: 'state_sync',
        tournamentState: this.tournamentState
      });
      if (this.onStateUpdate) {
        this.onStateUpdate(this.tournamentState);
      }
    } else if (data.type === 'state_sync' && !this.isHost) {
      // Player receives state from host
      this.tournamentState = data.tournamentState;
      if (this.onStateUpdate) {
        this.onStateUpdate(this.tournamentState);
      }
    } else if (data.type === 'joined' && !this.isHost) {
      // Player receives confirmation of joining
      this.tournamentState = data.tournamentState;
      this.playerId = data.yourId;
      if (this.onStateUpdate) {
        this.onStateUpdate(this.tournamentState);
      }
    } else if (data.type === 'player_joined') {
      // All players notified of new player
      this.tournamentState = data.tournamentState;
      if (this.onPlayerJoin) {
        this.onPlayerJoin(data.player);
      }
      if (this.onStateUpdate) {
        this.onStateUpdate(this.tournamentState);
      }
    } else if (data.type === 'game_action') {
      // Handle game actions
      if (this.onMessage) {
        this.onMessage(data);
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
      
      // Update tournament state
      this.tournamentState.players = this.players;
      
      // Broadcast to all players
      this.broadcast({
        type: 'player_left',
        playerId: playerId,
        tournamentState: this.tournamentState
      });

      if (this.onPlayerLeave) {
        this.onPlayerLeave(playerId);
      }

      // Update state for host
      if (this.onStateUpdate) {
        this.onStateUpdate(this.tournamentState);
      }
    }
  }

  // Send message to host (PLAYER only)
  sendToHost(message) {
    if (this.isHost) return;

    console.log("Sending message to host:", message);
    const hostConnection = this.connections[0];
    if (hostConnection && hostConnection.open) {
      try {
        hostConnection.send(message);
        console.log("Message sent to host successfully");
      } catch (err) {
        console.error('Send to host error:', err);
      }
    } else {
      console.error("No host connection available");
    }
  }

  // Update tournament state (call from host or send to host)
  updateTournamentState(updates) {
    if (this.isHost) {
      this.tournamentState = { ...this.tournamentState, ...updates };
      this.broadcast({
        type: 'state_sync',
        tournamentState: this.tournamentState
      });
      if (this.onStateUpdate) {
        this.onStateUpdate(this.tournamentState);
      }
    } else {
      this.sendToHost({
        type: 'state_update',
        updates: updates
      });
    }
  }

  // Broadcast message to all players
  broadcast(message) {
    console.log("Broadcasting tournament message:", message);
    this.connections.forEach(conn => {
      if (conn.open) {
        try {
          conn.send(message);
          console.log("Message sent to connection:", conn.peer);
        } catch (error) {
          console.error("Error sending message:", error);
        }
      }
    });
  }

  // Start tournament
  startTournament() {
    if (!this.isHost) return;

    const activePlayers = this.players.filter(p => !p.eliminated);
    if (activePlayers.length < 2) {
      throw new Error('Need at least 2 players to start tournament');
    }

    const updatedState = {
      ...this.tournamentState,
      status: 'playing',
      currentRound: 1,
      activePlayers: activePlayers.length
    };

    this.updateTournamentState(updatedState);
  }

  // End tournament
  endTournament(winner) {
    if (!this.isHost) return;

    const updatedState = {
      ...this.tournamentState,
      status: 'finished',
      winner: winner,
      endTime: new Date().toISOString()
    };

    this.updateTournamentState(updatedState);
  }

  // Eliminate player
  eliminatePlayer(playerId) {
    if (!this.isHost) return;

    const player = this.players.find(p => p.id === playerId);
    if (player) {
      player.eliminated = true;
      player.position = this.tournamentState.eliminatedPlayers.length + 1;
      this.tournamentState.eliminatedPlayers.push(player);

      // Check if tournament should end
      const activePlayers = this.players.filter(p => !p.eliminated);
      if (activePlayers.length === 1) {
        this.endTournament(activePlayers[0]);
      }

      this.updateTournamentState({
        players: this.players,
        eliminatedPlayers: this.tournamentState.eliminatedPlayers
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
  }
}
