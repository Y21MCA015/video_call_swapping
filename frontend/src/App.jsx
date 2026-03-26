import React, { useState, useRef, useEffect } from 'react';
import { CallWebSocket } from './services/websocket';
import './App.css';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

function App() {
  const [role, setRole] = useState('You');
  const [isConnected, setIsConnected] = useState(false);
  
  // Call states
  const [incomingCall, setIncomingCall] = useState(null); // stores {from}
  const [activeCall, setActiveCall] = useState(false);
  const [targetUser, setTargetUser] = useState(null);

  // Refs
  const wsRef = useRef(null);
  const pcRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);

  const setupMedia = async () => {
    try {
      if (!localStreamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      }
    } catch (err) {
      console.error("Failed to get local stream", err);
      alert("Microphone/Camera access required!");
    }
  };

  const createPeerConnection = (target) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    // Add local stream tracks to PC
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // On remote track received
    pc.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    // On ICE candidate generated
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        wsRef.current.sendMessage({
          type: 'ice_candidate',
          candidate: event.candidate,
          to: target,
          from: role
        });
      }
    };
    
    return pc;
  };

  const handleSignalingData = async (data) => {
    switch (data.type) {
      case 'call':
        // Someone is calling us
        setIncomingCall(data.from);
        break;

      case 'call_accepted':
        // The target has accepted our call, NOW we can safely create the offer.
        setTargetUser(data.from);
        (async () => {
          const pc = createPeerConnection(data.from);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          wsRef.current.sendMessage({
            type: 'offer',
            offer: offer,
            to: data.from,
            from: role
          });
        })();
        break;

      case 'call_ended':
        // The other person ended the call
        cleanupCall(false);
        break;

      case 'offer':
        // We received an SDP offer. Set remote desc and create answer.
        if (!pcRef.current) {
          // If we are answering without media ready (which shouldn't happen, we call setupMedia on 'Answer' click)
          // Just to be safe, if we don't have PC, we might have dropped.
          break;
        }
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pcRef.current.createAnswer();
        await pcRef.current.setLocalDescription(answer);
        
        wsRef.current.sendMessage({
          type: 'answer',
          answer: answer,
          to: data.from,
          from: role
        });
        break;

      case 'answer':
        // We received an SDP answer to our offer.
        if (pcRef.current) {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
        break;

      case 'ice_candidate':
        if (pcRef.current) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
        break;

      case 'call_rejected':
        alert(`${data.from} declined your call.`);
        endCall();
        break;
        
      default:
        break;
    }
  };

  const connect = () => {
    wsRef.current = new CallWebSocket(role, handleSignalingData);
    wsRef.current.connect();
    setIsConnected(true);
  };

  const startCall = async (target) => {
    setTargetUser(target);
    setActiveCall(true);
    await setupMedia();
    
    // Initial alert to wake up the UI. 
    // We will wait for "call_accepted" before creating the peer connection and offer.
    wsRef.current.sendMessage({ type: 'call', from: role, to: target });
  };

  const answerCall = async () => {
    if (!incomingCall) return;
    
    const caller = incomingCall;
    setTargetUser(caller);
    setIncomingCall(null);
    setActiveCall(true);

    await setupMedia();
    createPeerConnection(caller);

    // Let the caller know we are ready to receive their SDP offer
    wsRef.current.sendMessage({
      type: 'call_accepted',
      to: caller,
      from: role
    });
  };

  const rejectCall = () => {
    if (incomingCall) {
      wsRef.current.sendMessage({
        type: 'call_rejected',
        to: incomingCall,
        from: role
      });
      setIncomingCall(null);
    }
  };

  const cleanupCall = (notifyOther = true) => {
    if (notifyOther && targetUser) {
      wsRef.current.sendMessage({
        type: 'call_ended',
        to: targetUser,
        from: role
      });
    }
    
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    
    // Stop local camera tracks to free hardware
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    setActiveCall(false);
    setTargetUser(null);
    setIncomingCall(null);
  };

  const endCall = () => {
    cleanupCall(true);
  };

  // Re-bind media streams when component remounts or states change
  useEffect(() => {
    if (activeCall && localStreamRef.current && localVideoRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [activeCall]);

  return (
    <div className="container app-wrapper d-flex justify-content-center">
      <div className="card glass-card p-4 p-md-5 w-100" style={{ maxWidth: '800px' }}>
        <h1 className="text-center gradient-text mb-4">Video Call Hub</h1>
        
        {!isConnected ? (
          <div className="text-center">
            <h5 className="mb-3 text-light">Select your identity to connect</h5>
            <div className="mb-4 mx-auto" style={{ maxWidth: '300px' }}>
              <select 
                className="form-select form-select-lg form-select-glass mb-4" 
                value={role} 
                onChange={(e) => setRole(e.target.value)}
              >
                <option value="You">You (Caller)</option>
                <option value="A">User A</option>
                <option value="B">User B</option>
              </select>
              <button className="btn btn-gradient-primary w-100" onClick={connect}>
                <i className="bi bi-plug-fill me-2"></i>Connect to Server
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <span className="badge bg-info bg-opacity-25 text-info rounded-pill px-3 py-2 mb-3">
              Role: {role}
            </span>
            
            <div className="d-flex align-items-center justify-content-center text-success mb-4">
              <div className="spinner-grow spinner-grow-sm me-2" role="status"></div>
              <span>Connected to Secure Channel</span>
            </div>

            {!activeCall ? (
              <>
                {role === 'You' ? (
                  <div className="row g-3 mt-2">
                    <div className="col-12 col-sm-6">
                      <button className="btn btn-gradient-primary w-100 py-3" onClick={() => startCall('A')}>
                        <h5 className="mb-0">📞 Start Call to A</h5>
                      </button>
                    </div>
                    <div className="col-12 col-sm-6">
                      <button className="btn btn-gradient-primary w-100 py-3" onClick={() => startCall('B')}>
                        <h5 className="mb-0">📞 Start Call to B</h5>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="alert alert-dark bg-opacity-25 border-secondary mt-4">
                    <h5 className="mb-2">Awaiting Calls...</h5>
                    <p className="text-muted small mb-0">Due to the call swapping logic, you may receive calls intended for the other user.</p>
                  </div>
                )}
              </>
            ) : (
              <div className="video-dashboard mt-4">
                <h4 className="mb-3">In Call with {targetUser}</h4>
                <div className="row g-3">
                  <div className="col-12 col-md-6">
                    <div className="card bg-dark text-white border-secondary h-100">
                      <video ref={localVideoRef} autoPlay muted playsInline className="w-100 rounded" style={{ height: '300px', objectFit: 'cover' }}></video>
                      <div className="card-footer border-secondary text-center">Local Feed</div>
                    </div>
                  </div>
                  <div className="col-12 col-md-6">
                    <div className="card bg-dark text-white border-secondary h-100">
                      <video ref={remoteVideoRef} autoPlay playsInline className="w-100 rounded" style={{ height: '300px', objectFit: 'cover' }}></video>
                      <div className="card-footer border-secondary text-center">Remote Feed</div>
                    </div>
                  </div>
                </div>
                <button className="btn btn-gradient-danger mt-4 px-5 py-2" onClick={endCall}>
                  End Call
                </button>
              </div>
            )}

            {incomingCall && !activeCall && (
              <div className="modal-backdrop-glass">
                <div className="card glass-card p-4 text-center mx-3" style={{ maxWidth: '400px', width: '100%' }}>
                  <div className="pulse-ring mx-auto mb-3">
                    🎥
                  </div>
                  <h3 className="text-white mb-2">Incoming Call</h3>
                  <p className="text-light mb-4">
                    <strong>{incomingCall}</strong> is trying to establish a video link with you.
                  </p>
                  <div className="d-flex justify-content-center gap-3">
                    <button className="btn btn-gradient-success flex-grow-1" onClick={answerCall}>
                      Answer
                    </button>
                    <button className="btn btn-gradient-danger flex-grow-1" onClick={rejectCall}>
                      Decline
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
