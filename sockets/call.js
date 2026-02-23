module.exports = function setupCallSockets(io) {
    io.on('connection', (socket) => {
        const session = socket.request.session;
        if (!session || !session.userId) return;

        // Initiate a call
        socket.on('call-user', (data) => {
            const { targetUserId, offer, callerName, callType } = data;
            console.log(`[AETHER] Call initiated: ${callerName} -> ${targetUserId} (${callType})`);

            io.to(targetUserId).emit('incoming-call', {
                from: socket.id,
                callerUserId: data.callerUserId,
                callerName,
                offer,
                callType
            });
        });

        // Answer a call
        socket.on('call-answer', (data) => {
            const { targetUserId, answer, answererName } = data;
            console.log(`[AETHER] Call answered by: ${answererName}`);

            io.to(targetUserId).emit('call-answered', {
                from: socket.id,
                answer,
                answererName
            });
        });

        // ICE candidate exchange
        socket.on('ice-candidate', (data) => {
            const { targetUserId, candidate } = data;

            io.to(targetUserId).emit('ice-candidate', {
                from: socket.id,
                candidate
            });
        });

        // Reject a call
        socket.on('call-reject', (data) => {
            const { targetUserId, reason } = data;
            console.log(`[AETHER] Call rejected: ${reason || 'declined'}`);

            io.to(targetUserId).emit('call-rejected', {
                from: socket.id,
                reason: reason || 'declined'
            });
        });

        // End a call
        socket.on('call-end', (data) => {
            const { targetUserId } = data;
            console.log(`[AETHER] Call ended`);

            io.to(targetUserId).emit('call-ended', {
                from: socket.id
            });
        });
    });
};
