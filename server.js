const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 10;

const COLOURS = [
    0x8d64aa, // Purple
    0x1594fd, // Blue
    0xf35b05, // Orange
    0x5cb9bb, // Teal
    0xffd10a, // Yellow
    0x162e76, // Navy
    0xff60ff, // Pink
    0xda0600, // Red
    0x000000, // Black
    0xffffff  // White
];

const rooms = new Map();

/*
 * Serve the browser game.
 */
app.use(
    express.static(
        path.join(__dirname, 'public')
    )
);

/*
 * Useful Railway deployment check.
 */
app.get('/health', (request, response) => {

    response.json({
        ok: true,
        version: '14.0.3',
        rooms: rooms.size
    });
});

/*
 * Send unknown browser routes back to the game.
 */
app.get('*', (request, response) => {

    response.sendFile(
        path.join(
            __dirname,
            'public',
            'index.html'
        )
    );
});

/*
 * Remove unsafe markup and limit text length.
 */
function cleanText(value, maximumLength) {

    return String(value || '')
        .replace(/[<>]/g, '')
        .trim()
        .slice(0, maximumLength);
}

/*
 * Generate a room code from 1000 to 9999.
 */
function createRoomCode() {

    for (let attempt = 0; attempt < 10000; attempt += 1) {

        const roomCode = String(
            crypto.randomInt(1000, 10000)
        );

        if (!rooms.has(roomCode)) {
            return roomCode;
        }
    }

    throw new Error(
        'No room codes are currently available.'
    );
}

/*
 * Return only client-safe room information.
 */
function createRoomSnapshot(room) {

    return {
        code: room.code,
        hostId: room.hostId,
        scene: room.scene,

        players: [
            ...room.players.values()
        ].map(player => {

            const {
                socketId,
                ...safePlayer
            } = player;

            return safePlayer;
        }),

        world: {
            ...room.world
        }
    };
}

/*
 * Send the current room data to every connected player.
 */
function broadcastRoom(room) {

    io.to(room.code).emit(
        'room-state',
        createRoomSnapshot(room)
    );
}

/*
 * Find the room and player belonging to a socket.
 */
function getSocketContext(socket) {

    const roomCode = socket.data.roomCode;
    const playerId = socket.data.playerId;

    if (!roomCode || !playerId) {
        return null;
    }

    const room = rooms.get(roomCode);

    if (!room) {
        return null;
    }

    const player = room.players.get(playerId);

    if (!player) {
        return null;
    }

    return {
        room,
        player
    };
}

/*
 * Only connected players should block collective completion.
 */
function getConnectedPlayers(room) {

    return [
        ...room.players.values()
    ].filter(player => player.connected);
}

/*
 * Reset positions whenever the host changes scene.
 *
 * Every browser still uses its own scene-specific spawn position,
 * but clearing the previous coordinates prevents stale remote Cats
 * appearing at their old level position.
 */
function resetPlayerPositions(room) {

    for (const player of room.players.values()) {

        player.x = 960;
        player.y = 120;
        player.vx = 0;
        player.vy = 0;
        player.facing = 1;
        player.pose = 'fall';
        player.sequence = 0;
    }
}

io.on('connection', socket => {

    /*
     * CREATE ROOM
     */
    socket.on(
        'create-room',
        (
            {
                playerId,
                name
            },
            acknowledge = () => {}
        ) => {

            try {

                const roomCode = createRoomCode();

                const safePlayerId =
                    cleanText(playerId, 80);

                if (!safePlayerId) {

                    acknowledge({
                        ok: false,
                        message:
                            'A player identity could not be created.'
                    });

                    return;
                }

                const player = {
                    id: safePlayerId,
                    name:
                        cleanText(name, 18) ||
                        'Cat',

                    color: null,

                    x: 960,
                    y: 120,
                    vx: 0,
                    vy: 0,

                    facing: 1,
                    pose: 'fall',
                    sequence: 0,

                    hasCostume: false,
                    hasFish: false,
                    depositedFish: false,

                    connected: true,
                    socketId: socket.id
                };

                const room = {
                    code: roomCode,
                    hostId: safePlayerId,
                    scene: 'CatChoose',

                    players: new Map([
                        [
                            safePlayerId,
                            player
                        ]
                    ]),

                    world: {
                        Warehouse: false,
                        Dock: false,
                        Rooftops: false,
                        chestDropped: false
                    }
                };

                rooms.set(
                    roomCode,
                    room
                );

                socket.join(roomCode);

                socket.data.roomCode =
                    roomCode;

                socket.data.playerId =
                    safePlayerId;

                acknowledge({
                    ok: true,
                    room:
                        createRoomSnapshot(room)
                });

            } catch (error) {

                console.error(
                    'Create room failed:',
                    error
                );

                acknowledge({
                    ok: false,
                    message:
                        'The room could not be created.'
                });
            }
        }
    );

    /*
     * JOIN ROOM
     */
    socket.on(
        'join-room',
        (
            {
                code,
                playerId,
                name
            },
            acknowledge = () => {}
        ) => {

            const roomCode =
                cleanText(code, 4);

            const room =
                rooms.get(roomCode);

            if (!room) {

                acknowledge({
                    ok: false,
                    message:
                        'Room not found.'
                });

                return;
            }

            const safePlayerId =
                cleanText(playerId, 80);

            if (!safePlayerId) {

                acknowledge({
                    ok: false,
                    message:
                        'A player identity could not be created.'
                });

                return;
            }

            let player =
                room.players.get(
                    safePlayerId
                );

            if (
                !player &&
                room.players.size >= MAX_PLAYERS
            ) {

                acknowledge({
                    ok: false,
                    message:
                        'Room is full.'
                });

                return;
            }

            if (!player) {

                player = {
                    id: safePlayerId,

                    name:
                        cleanText(name, 18) ||
                        'Cat',

                    color: null,

                    x: 960,
                    y: 120,
                    vx: 0,
                    vy: 0,

                    facing: 1,
                    pose: 'fall',
                    sequence: 0,

                    hasCostume: false,
                    hasFish: false,
                    depositedFish: false,

                    connected: true,
                    socketId: socket.id
                };

                room.players.set(
                    safePlayerId,
                    player
                );

            } else {

                player.connected = true;
                player.socketId = socket.id;

                const updatedName =
                    cleanText(name, 18);

                if (updatedName) {
                    player.name = updatedName;
                }
            }

            socket.join(room.code);

            socket.data.roomCode =
                room.code;

            socket.data.playerId =
                safePlayerId;

            broadcastRoom(room);

            acknowledge({
                ok: true,
                room:
                    createRoomSnapshot(room)
            });
        }
    );

    /*
     * CHOOSE CAT COLOUR
     */
    socket.on(
        'choose-color',
        (
            {
                color
            },
            acknowledge = () => {}
        ) => {

            const context =
                getSocketContext(socket);

            if (!context) {

                acknowledge({
                    ok: false,
                    message:
                        'Room unavailable.'
                });

                return;
            }

            const {
                room,
                player
            } = context;

            if (!COLOURS.includes(color)) {

                acknowledge({
                    ok: false,
                    message:
                        'That Cat colour is unavailable.'
                });

                return;
            }

            const colourTaken = [
                ...room.players.values()
            ].some(otherPlayer => {

                return (
                    otherPlayer.id !==
                        player.id &&
                    otherPlayer.color === color
                );
            });

            if (colourTaken) {

                acknowledge({
                    ok: false,
                    message:
                        'That Cat colour has already been taken.'
                });

                return;
            }

            player.color = color;

            broadcastRoom(room);

            acknowledge({
                ok: true
            });
        }
    );

    /*
     * HOST SCENE CHANGE
     *
     * Used by:
     * - Start Game
     * - Next cutscene
     * - Map locations
     * - Return to Map
     */
    socket.on(
        'set-scene',
        (
            {
                scene
            },
            acknowledge = () => {}
        ) => {

            const context =
                getSocketContext(socket);

            if (!context) {

                acknowledge({
                    ok: false,
                    message:
                        'Room unavailable.'
                });

                return;
            }

            const {
                room,
                player
            } = context;

            if (room.hostId !== player.id) {

                acknowledge({
                    ok: false,
                    message:
                        'Only the host can change scenes.'
                });

                return;
            }

            const allowedScenes = [
                'Lobby',

                'Intro1',
                'Intro2',
                'Intro3',

                'Map',

                'Warehouse',
                'Dock',
                'Rooftops',

                'Outro1',
                'Outro2'
            ];

            if (!allowedScenes.includes(scene)) {

                acknowledge({
                    ok: false,
                    message:
                        'That scene is unavailable.'
                });

                return;
            }

            room.scene = scene;

            resetPlayerPositions(room);

            /*
             * Send the new room snapshot before changing scenes.
             */
            broadcastRoom(room);

            /*
             * Move every connected browser together.
             */
            io.to(room.code).emit(
                'scene-change',
                {
                    scene
                }
            );

            acknowledge({
                ok: true,
                scene
            });
        }
    );

    /*
     * PLAYER MOVEMENT
     */
    socket.on(
        'player-state',
        data => {

            const context =
                getSocketContext(socket);

            if (!context) {
                return;
            }

            const {
                room,
                player
            } = context;

            player.sequence =
                (player.sequence || 0) + 1;

            if (Number.isFinite(data.x)) {
                player.x = data.x;
            }

            if (Number.isFinite(data.y)) {
                player.y = data.y;
            }

            if (Number.isFinite(data.vx)) {
                player.vx = data.vx;
            }

            if (Number.isFinite(data.vy)) {
                player.vy = data.vy;
            }

            player.facing =
                data.facing === -1
                    ? -1
                    : 1;

            const allowedPoses = [
                'idle',
                'run',
                'leap',
                'fall'
            ];

            player.pose =
                allowedPoses.includes(
                    data.pose
                )
                    ? data.pose
                    : 'idle';

            /*
             * Movement is broadcast to everyone except the sender.
             */
            socket
                .to(room.code)
                .emit(
                    'player-state',
                    {
                        id: player.id,

                        sequence:
                  
