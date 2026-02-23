module.exports = function setupCallSockets(io) {
    io.on('connection', (socket) => {

        // Initiate a call
        socket.on('call-user', (data) => {
            const { targetUserId, offer, callerName, callType } = data;
            console.log(`[NERV] Call initiated: ${callerName} -> ${targetUserId} (${callType})`);

            io.to(`user:${targetUserId}`).emit('incoming-call', {
                from: socket.id,
                callerUserId: data.callerUserId,
                callerName,
                offer,
                callType // 'audio' or 'video'
            });
        });

        // Answer a call
        socket.on('call-answer', (data) => {
            const { targetSocketId, answer, answererName } = data;
            console.log(`[NERV] Call answered by: ${answererName}`);

            io.to(data.targetUserId ? `user:${data.targetUserId}` : targetSocketId).emit('call-answered', {
                from: socket.id,
                answer,
                answererName
            });
        });

        // ICE candidate exchange
        socket.on('ice-candidate', (data) => {
            const { targetUserId, candidate } = data;

            io.to(`user:${targetUserId}`).emit('ice-candidate', {
                from: socket.id,
                candidate
            });
        });

        // Reject a call
        socket.on('call-reject', (data) => {
            const { targetUserId, reason } = data;
            console.log(`[NERV] Call rejected: ${reason || 'declined'}`);

            io.to(`user:${targetUserId}`).emit('call-rejected', {
                from: socket.id,
                reason: reason || 'declined'
            });
        });

        // End a call
        socket.on('call-end', (data) => {
            const { targetUserId } = data;
            console.log(`[NERV] Call ended`);

            io.to(`user:${targetUserId}`).emit('call-ended', {
                from: socket.id
            });
        });
    });
};
