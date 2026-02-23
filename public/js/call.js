/* ═══════════════════════════════════════════════════════════════
   NERV COMM — Call Module (WebRTC)
   ═══════════════════════════════════════════════════════════════ */

const Call = {
    peerConnection: null,
    localStream: null,
    remoteStream: null,
    callTimer: null,
    callSeconds: 0,
    isMuted: false,
    isCameraOff: false,
    currentCallTarget: null,
    incomingCallData: null,

    // STUN/TURN servers for NAT traversal
    iceConfig: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            {
                urls: 'turn:openrelay.metered.ca:80',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            },
            {
                urls: 'turn:openrelay.metered.ca:443',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            }
        ]
    },

    // ─── Bind socket events for call signaling ───
    bindSocketEvents(socket) {
        socket.on('incoming-call', (data) => {
            this.handleIncomingCall(data);
        });

        socket.on('call-answered', (data) => {
            this.handleCallAnswered(data);
        });

        socket.on('ice-candidate', (data) => {
            this.handleIceCandidate(data);
        });

        socket.on('call-rejected', (data) => {
            this.handleCallRejected(data);
        });

        socket.on('call-ended', (data) => {
            this.handleCallEnded();
        });

        // UI controls
        document.getElementById('btn-toggle-mic').addEventListener('click', () => this.toggleMic());
        document.getElementById('btn-toggle-camera').addEventListener('click', () => this.toggleCamera());
        document.getElementById('btn-end-call').addEventListener('click', () => this.endCall());
        document.getElementById('btn-accept-call').addEventListener('click', () => this.acceptCall());
        document.getElementById('btn-reject-call').addEventListener('click', () => this.rejectCall());
    },

    // ─── Initiate a call ───
    async initiateCall(target, callType = 'audio') {
        this.currentCallTarget = target;

        try {
            // Get media stream
            const constraints = {
                audio: true,
                video: callType === 'video'
            };

            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);

            // Show call overlay
            this.showCallUI(target, callType);

            // Set local video
            if (callType === 'video') {
                document.getElementById('local-video').srcObject = this.localStream;
                document.getElementById('local-video').style.display = 'block';
            } else {
                document.getElementById('local-video').style.display = 'none';
            }

            // Create peer connection
            this.peerConnection = new RTCPeerConnection(this.iceConfig);

            // Add local tracks
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });

            // Handle remote stream
            this.remoteStream = new MediaStream();
            document.getElementById('remote-video').srcObject = this.remoteStream;

            this.peerConnection.ontrack = (event) => {
                event.streams[0].getTracks().forEach(track => {
                    this.remoteStream.addTrack(track);
                });
                // Hide avatar when remote video appears
                if (callType === 'video') {
                    document.getElementById('call-user-info').style.display = 'none';
                    document.getElementById('remote-video').style.display = 'block';
                }
            };

            // ICE candidates
            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    App.socket.emit('ice-candidate', {
                        targetUserId: target.id,
                        candidate: event.candidate
                    });
                }
            };

            // Connection state monitoring
            this.peerConnection.onconnectionstatechange = () => {
                const state = this.peerConnection.connectionState;
                const statusText = document.getElementById('call-status-text');

                switch (state) {
                    case 'connecting':
                        statusText.textContent = 'ESTABLISHING LINK...';
                        break;
                    case 'connected':
                        statusText.textContent = 'LINK ESTABLISHED';
                        this.startTimer();
                        break;
                    case 'disconnected':
                    case 'failed':
                        statusText.textContent = 'LINK LOST';
                        setTimeout(() => this.endCall(), 2000);
                        break;
                }
            };

            // Create and send offer
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);

            App.socket.emit('call-user', {
                targetUserId: target.id,
                callerUserId: App.currentUser.id,
                callerName: App.currentUser.username,
                offer,
                callType
            });

            document.getElementById('call-status-text').textContent = 'CALLING...';

        } catch (err) {
            console.error('[NERV] Call initiation failed:', err);
            this.endCall();

            if (err.name === 'NotAllowedError') {
                alert('Camera/microphone access denied. Please allow access and try again.');
            }
        }
    },

    // ─── Handle incoming call ───
    handleIncomingCall(data) {
        this.incomingCallData = data;

        const modal = document.getElementById('incoming-call-modal');
        const avatar = document.getElementById('incoming-avatar');
        const name = document.getElementById('incoming-name');
        const type = document.getElementById('incoming-type');

        avatar.style.background = 'var(--nerv-red)';
        avatar.textContent = data.callerName.charAt(0).toUpperCase();
        name.textContent = data.callerName.toUpperCase();
        type.textContent = `INCOMING ${data.callType.toUpperCase()} CALL`;

        modal.style.display = 'flex';

        // Auto-reject after 30 seconds
        this.autoRejectTimeout = setTimeout(() => {
            this.rejectCall();
        }, 30000);
    },

    // ─── Accept incoming call ───
    async acceptCall() {
        if (!this.incomingCallData) return;

        const data = this.incomingCallData;
        clearTimeout(this.autoRejectTimeout);

        // Hide incoming modal
        document.getElementById('incoming-call-modal').style.display = 'none';

        try {
            const constraints = {
                audio: true,
                video: data.callType === 'video'
            };

            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);

            const target = {
                id: data.callerUserId,
                name: data.callerName,
                color: 'var(--nerv-red)'
            };

            this.currentCallTarget = target;
            this.showCallUI(target, data.callType);

            if (data.callType === 'video') {
                document.getElementById('local-video').srcObject = this.localStream;
                document.getElementById('local-video').style.display = 'block';
            } else {
                document.getElementById('local-video').style.display = 'none';
            }

            // Create peer connection
            this.peerConnection = new RTCPeerConnection(this.iceConfig);

            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });

            this.remoteStream = new MediaStream();
            document.getElementById('remote-video').srcObject = this.remoteStream;

            this.peerConnection.ontrack = (event) => {
                event.streams[0].getTracks().forEach(track => {
                    this.remoteStream.addTrack(track);
                });
                if (data.callType === 'video') {
                    document.getElementById('call-user-info').style.display = 'none';
                    document.getElementById('remote-video').style.display = 'block';
                }
            };

            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    App.socket.emit('ice-candidate', {
                        targetUserId: data.callerUserId,
                        candidate: event.candidate
                    });
                }
            };

            this.peerConnection.onconnectionstatechange = () => {
                const state = this.peerConnection.connectionState;
                const statusText = document.getElementById('call-status-text');

                switch (state) {
                    case 'connecting':
                        statusText.textContent = 'ESTABLISHING LINK...';
                        break;
                    case 'connected':
                        statusText.textContent = 'LINK ESTABLISHED';
                        this.startTimer();
                        break;
                    case 'disconnected':
                    case 'failed':
                        statusText.textContent = 'LINK LOST';
                        setTimeout(() => this.endCall(), 2000);
                        break;
                }
            };

            // Set remote description (the offer)
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));

            // Create answer
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            App.socket.emit('call-answer', {
                targetUserId: data.callerUserId,
                answer,
                answererName: App.currentUser.username
            });

            document.getElementById('call-status-text').textContent = 'CONNECTING...';

        } catch (err) {
            console.error('[NERV] Failed to accept call:', err);
            this.endCall();
        }

        this.incomingCallData = null;
    },

    // ─── Reject incoming call ───
    rejectCall() {
        if (!this.incomingCallData) return;

        clearTimeout(this.autoRejectTimeout);

        App.socket.emit('call-reject', {
            targetUserId: this.incomingCallData.callerUserId,
            reason: 'declined'
        });

        document.getElementById('incoming-call-modal').style.display = 'none';
        this.incomingCallData = null;
    },

    // ─── Handle call answered ───
    async handleCallAnswered(data) {
        try {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
            document.getElementById('call-status-text').textContent = 'CONNECTING...';
        } catch (err) {
            console.error('[NERV] Failed to handle call answer:', err);
        }
    },

    // ─── Handle ICE candidate ───
    async handleIceCandidate(data) {
        try {
            if (this.peerConnection) {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        } catch (err) {
            console.error('[NERV] ICE candidate error:', err);
        }
    },

    // ─── Handle call rejected ───
    handleCallRejected(data) {
        document.getElementById('call-status-text').textContent = 'CALL DECLINED';
        setTimeout(() => this.endCall(), 2000);
    },

    // ─── Handle call ended by remote ───
    handleCallEnded() {
        document.getElementById('call-status-text').textContent = 'LINK TERMINATED';
        setTimeout(() => this.cleanup(), 1000);
    },

    // ─── End call ───
    endCall() {
        if (this.currentCallTarget) {
            App.socket.emit('call-end', {
                targetUserId: this.currentCallTarget.id
            });
        }

        this.cleanup();
    },

    // ─── Cleanup ───
    cleanup() {
        // Stop local stream
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        // Close peer connection
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        // Reset remote stream
        this.remoteStream = null;

        // Stop timer
        this.stopTimer();

        // Reset state
        this.currentCallTarget = null;
        this.isMuted = false;
        this.isCameraOff = false;

        // Reset UI
        document.getElementById('call-overlay').style.display = 'none';
        document.getElementById('incoming-call-modal').style.display = 'none';
        document.getElementById('btn-toggle-mic').classList.remove('muted');
        document.getElementById('btn-toggle-camera').classList.remove('muted');
        document.getElementById('call-user-info').style.display = '';
        document.getElementById('remote-video').style.display = 'none';
        document.getElementById('local-video').style.display = 'none';
    },

    // ─── Show call UI ───
    showCallUI(target, callType) {
        const overlay = document.getElementById('call-overlay');
        const avatar = document.getElementById('call-avatar');
        const name = document.getElementById('call-user-name');
        const typeLabel = document.getElementById('call-type-label');

        avatar.style.background = target.color || 'var(--nerv-red)';
        avatar.textContent = target.name.charAt(0).toUpperCase();
        name.textContent = target.name.toUpperCase();
        typeLabel.textContent = `${callType.toUpperCase()} CALL`;

        document.getElementById('call-timer').textContent = '00:00';
        document.getElementById('call-status-text').textContent = 'INITIATING LINK...';

        overlay.style.display = 'block';
    },

    // ─── Toggle mic ───
    toggleMic() {
        if (!this.localStream) return;

        this.isMuted = !this.isMuted;
        this.localStream.getAudioTracks().forEach(track => {
            track.enabled = !this.isMuted;
        });

        document.getElementById('btn-toggle-mic').classList.toggle('muted', this.isMuted);
    },

    // ─── Toggle camera ───
    toggleCamera() {
        if (!this.localStream) return;

        this.isCameraOff = !this.isCameraOff;
        this.localStream.getVideoTracks().forEach(track => {
            track.enabled = !this.isCameraOff;
        });

        document.getElementById('btn-toggle-camera').classList.toggle('muted', this.isCameraOff);
    },

    // ─── Call timer ───
    startTimer() {
        this.callSeconds = 0;
        this.callTimer = setInterval(() => {
            this.callSeconds++;
            const mins = Math.floor(this.callSeconds / 60).toString().padStart(2, '0');
            const secs = (this.callSeconds % 60).toString().padStart(2, '0');
            document.getElementById('call-timer').textContent = `${mins}:${secs}`;
        }, 1000);
    },

    stopTimer() {
        if (this.callTimer) {
            clearInterval(this.callTimer);
            this.callTimer = null;
        }
        this.callSeconds = 0;
    }
};
