import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, ZoomControl } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { supabase } from './supabaseClient';

// Fix for default map markers
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

const homestaysData = [
  { id: 1, name: "Floating Phumdi Retreat", description: "Experience authentic Manipuri culture living on a traditional floating biomass island. 100% solar powered.", price: "₹1,200/night", phone: "919876543210", image: "https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/1_Loktak_Lake.jpg&width=800" },
  { id: 2, name: "Karang Eco Lodge", description: "Stay on India's first cashless island. Enjoy guided zero-waste boat tours and organic local cuisine.", price: "₹1,800/night", phone: "919876543211", image: "https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/The_Loktak_Lake.jpg&width=800" },
  { id: 3, name: "Sendra Heights Eco-Stay", description: "Panoramic hilltop views of the lake. Features rainwater harvesting and community-led conservation walks.", price: "₹2,500/night", phone: "919876543212", image: "https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/Loktak_lake.jpg&width=800" }
];

function App() {
  const loktakCenter = [24.5, 93.8];
  const mapRef = useRef(null);
  
  const [activeTab, setActiveTab] = useState('map');
  const [isReporting, setIsReporting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  const [showSOSPanel, setShowSOSPanel] = useState(false); 

  const [reports, setReports] = useState([]);
  
  const [totalOpen, setTotalOpen] = useState(0);
  const [totalResolved, setTotalResolved] = useState(0);
  const [criticalCount, setCriticalCount] = useState(0);

  const [file, setFile] = useState(null);
  const [severity, setSeverity] = useState('');
  const [location, setLocation] = useState(null);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    const { data, error } = await supabase
      .from('trash_reports')
      .select('*')
      .order('created_at', { ascending: false });
      
    if (!error) {
      setReports(data);
      setTotalOpen(data.filter(r => r.status !== 'resolved').length);
      setTotalResolved(data.filter(r => r.status === 'resolved').length);
      setCriticalCount(data.filter(r => r.status !== 'resolved' && r.severity === 'critical').length);
    }
  };

  const markAsResolved = async (id) => {
    const enteredPin = prompt("Enter the 4-digit Cleanup Crew PIN to verify this action:");
    if (enteredPin !== "2026") {
      alert("❌ Incorrect PIN. Only authorized cleanup crews can mark areas as resolved.");
      return; 
    }

    const { error } = await supabase
      .from('trash_reports')
      .update({ status: 'resolved' })
      .eq('id', id);
      
    if (error) {
      alert("Error updating report: " + error.message);
    } else {
      alert("✅ Area successfully marked as restored!");
      fetchReports();
    }
  };

  const getMarkerIcon = (severityLevel, status) => {
    if (status === 'resolved') {
      return L.divIcon({
        className: 'custom-leaflet-icon',
        html: `<div class="bg-gray-400 w-5 h-5 rounded-full border-2 border-white shadow-sm flex items-center justify-center opacity-60"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      });
    }

    let bgColor = 'bg-emerald-500';
    if (severityLevel === 'medium') bgColor = 'bg-orange-500';
    if (severityLevel === 'critical') bgColor = 'bg-red-600';

    return L.divIcon({
      className: 'custom-leaflet-icon',
      html: `<div class="${bgColor} w-6 h-6 rounded-full border-2 border-white shadow-lg flex items-center justify-center animate-pulse"></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
  };

  const handleGetLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => setLocation({ lat: position.coords.latitude, lng: position.coords.longitude }),
        (error) => alert("We need your location to pin the trash on the map!")
      );
    }
  };

  const handleLocateMe = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          if (mapRef.current) {
            mapRef.current.flyTo([lat, lng], 15, { animate: true, duration: 1.5 });
          }
        },
        (error) => {
          alert("Could not access GPS. Please enable location services.");
        }
      );
    } else {
      alert("Geolocation is not supported by your browser.");
    }
  };

  const openReportModal = () => {
    setIsReporting(true);
    handleGetLocation();
  };

  const submitReport = async () => {
    if (!file || !severity || !location) return alert("Please ensure you have a photo, selected a severity, and allowed GPS.");
    setIsUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('trash_photos').upload(fileName, file);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('trash_photos').getPublicUrl(fileName);

      const { error: dbError } = await supabase.from('trash_reports').insert([{
        latitude: location.lat,
        longitude: location.lng,
        severity: severity,
        photo_url: urlData.publicUrl,
        status: 'open'
      }]);
      if (dbError) throw dbError;

      alert("Report submitted successfully!");
      setIsReporting(false);
      setFile(null);
      setSeverity('');
      setLocation(null);
      fetchReports();
    } catch (error) {
      alert("Error submitting report: " + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const dispatchEmergency = (emergencyType) => {
    setShowSOSPanel(false); 

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude.toFixed(6);
          const lng = position.coords.longitude.toFixed(6);
          const mapLink = `http://googleusercontent.com/maps.google.com/?q=${lat},${lng}`;
          
          alert(`🚨 DEMO MODE: SOS Triggered!\n\nDispatched to Loktak Emergency Services.\n\nDATA PAYLOAD GENERATED:\n"EMERGENCY TYPE: [${emergencyType.toUpperCase()}] at Loktak Lake!\nMy exact GPS location is:\n${mapLink}"`);
        },
        (error) => {
          alert("Could not access GPS. Please ensure location services are enabled to send an SOS.");
        }
      );
    } else {
      alert("Geolocation is not supported by your browser.");
    }
  };

  return (
    <div className="h-screen w-full flex flex-col bg-gray-50 overflow-hidden">
      
      <header className="bg-emerald-600 text-white p-4 shadow-md z-10 flex-shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">Eco Loktak</h1>
        <p className="text-emerald-100 text-sm">Community Protection Platform</p>
      </header>

      <main className="flex-grow relative overflow-y-auto">
        
        {/* --- TAB 1: MAP --- */}
        {activeTab === 'map' && (
          <div className="h-full w-full relative">
            <div className="absolute top-4 left-4 z-[1000] flex flex-col gap-3 pointer-events-none">
              <div className="bg-white/95 backdrop-blur-sm p-4 rounded-xl shadow-lg border-l-4 border-emerald-500 pointer-events-auto min-w-[160px]">
                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Active Reports</p>
                <p className="text-3xl font-black text-gray-800">{totalOpen}</p>
              </div>
              <div className="bg-white/95 backdrop-blur-sm p-4 rounded-xl shadow-lg border-l-4 border-red-600 pointer-events-auto min-w-[160px]">
                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Critical Spots 🚨</p>
                <p className="text-3xl font-black text-red-600">{criticalCount}</p>
              </div>
              <div className="bg-white/95 backdrop-blur-sm p-4 rounded-xl shadow-lg border-l-4 border-blue-500 pointer-events-auto min-w-[160px]">
                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">Cleaned Up 🌿</p>
                <p className="text-3xl font-black text-blue-600">{totalResolved}</p>
              </div>
            </div>

            <MapContainer ref={mapRef} center={loktakCenter} zoom={12} style={{ height: '100%', width: '100%' }} zoomControl={false}>
              <TileLayer attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <ZoomControl position="bottomleft" />
              
              {reports.map((report) => (
                <Marker key={report.id} position={[report.latitude, report.longitude]} icon={getMarkerIcon(report.severity, report.status)}>
                  <Popup>
                    <div className="w-48">
                      {report.photo_url && <img src={report.photo_url} alt="Trash report" className="w-full h-32 object-cover rounded-md mb-2" />}
                      <p className="capitalize font-bold text-gray-800">Severity: {report.severity}</p>
                      <p className="text-xs text-gray-500 mt-1 mb-3">{new Date(report.created_at).toLocaleDateString()}</p>
                      
                      {report.status !== 'resolved' ? (
                        <button onClick={() => markAsResolved(report.id)} className="w-full bg-blue-500 text-white font-bold py-2 px-4 rounded shadow hover:bg-blue-600 transition-colors">
                          🧹 Mark as Cleaned
                        </button>
                      ) : (
                        <div className="w-full bg-gray-100 text-green-700 text-center font-bold py-2 px-4 rounded border border-green-200">
                          ✨ Area Restored
                        </div>
                      )}
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>

            {/* --- MAP LEGEND --- */}
            <div className="absolute bottom-24 left-4 z-[1000] bg-white/95 backdrop-blur-sm p-3 rounded-xl shadow-lg border border-gray-100 pointer-events-auto">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Severity</p>
              <div className="flex flex-col gap-2 text-sm font-medium text-gray-700">
                <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full bg-emerald-500 border border-gray-200 shadow-sm"></div> Low</div>
                <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full bg-orange-500 border border-gray-200 shadow-sm"></div> Medium</div>
                <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full bg-red-600 border border-gray-200 shadow-sm"></div> Critical</div>
                <div className="flex items-center gap-2"><div className="w-4 h-4 rounded-full bg-gray-400 border border-gray-200 shadow-sm opacity-60"></div> Cleaned</div>
              </div>
            </div>

            {/* --- LOCATE ME BUTTON --- */}
            <button 
              onClick={handleLocateMe} 
              className="absolute bottom-24 right-6 z-[1000] bg-white text-gray-700 w-14 h-14 rounded-full shadow-lg border border-gray-200 hover:bg-gray-50 transition-colors flex items-center justify-center focus:outline-none"
              title="Locate Me"
            >
              <span className="text-2xl">📍</span>
            </button>

            <button onClick={openReportModal} className="absolute bottom-6 right-6 z-[1000] bg-emerald-600 text-white px-6 py-4 rounded-full shadow-xl font-bold text-lg hover:bg-emerald-700 transition-transform hover:scale-105">
              📸 Report Trash
            </button>
          </div>
        )}

        {/* --- TAB 2: HOME STAY --- */}
        {activeTab === 'homestays' && (
          <div className="p-6 pb-24 max-w-4xl mx-auto">
            <div className="mb-6">
              <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Home Stay</h2>
              <p className="text-gray-500 mt-1">Verified local hosts protecting the lake.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {homestaysData.map((stay) => (
                <div key={stay.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
                  <img src={stay.image} alt={stay.name} className="w-full h-48 object-cover" />
                  <div className="p-5">
                    <h3 className="text-xl font-bold text-gray-800 leading-tight mb-2">{stay.name}</h3>
                    <span className="inline-block bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-1 rounded mb-3">✓ Verified Eco-Host</span>
                    <p className="text-gray-600 text-sm mb-4 line-clamp-3">{stay.description}</p>
                    
                    <div className="flex flex-wrap justify-between items-center mt-auto pt-4 border-t border-gray-100 gap-y-3">
                      <span className="text-lg font-black text-emerald-600 w-full 2xl:w-auto">{stay.price}</span>
                      
                      <div className="flex gap-2 w-full 2xl:w-auto">
                        <a 
                          href={`https://wa.me/${stay.phone}?text=Hi! I found your eco-stay on the Eco Loktak app. Are you available?`} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="flex-1 justify-center bg-[#25D366] text-white px-3 py-2 rounded-lg font-bold text-sm hover:bg-[#1ebd5a] transition-colors flex items-center gap-1 shadow-sm"
                        >
                          💬 WhatsApp
                        </a>
                        <a 
                          href={`tel:+${stay.phone}`} 
                          className="flex-1 justify-center bg-gray-100 text-gray-700 px-3 py-2 rounded-lg font-bold text-sm hover:bg-gray-200 transition-colors border border-gray-300 flex items-center gap-1 shadow-sm"
                        >
                          📞 Call
                        </a>
                      </div>
                    </div>
                    
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- TAB 3: SOS MAIN SCREEN --- */}
        {activeTab === 'sos' && (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 bg-red-50 pb-24">
            <div className="w-20 h-20 bg-red-200 rounded-full flex items-center justify-center mb-4 animate-bounce">
              <span className="text-4xl">🚨</span>
            </div>
            <h2 className="text-3xl font-black text-red-700 mb-2">Emergency SOS</h2>
            <p className="text-red-900/70 mb-12 max-w-xs mx-auto font-medium">Tap the button below to alert authorities.</p>
            
            <button 
              onClick={() => setShowSOSPanel(true)} 
              className="bg-red-600 text-white w-56 h-56 rounded-full shadow-[0_10px_35px_rgba(220,38,38,0.5)] font-black text-3xl border-8 border-red-300 hover:bg-red-700 active:scale-95 transition-all flex flex-col items-center justify-center gap-2"
            >
              <span className="text-5xl">🆘</span>SOS
            </button>
            <p className="text-xs text-red-500 font-bold mt-12 uppercase tracking-widest">For Severe Emergencies Only</p>
          </div>
        )}

      </main>

      {/* --- EMERGENCY TRIAGE PANEL OVERLAY --- */}
      {showSOSPanel && (
        <div className="absolute inset-0 z-[3000] bg-black/80 flex flex-col justify-end p-4 animate-in slide-in-from-bottom-10 duration-300">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md mx-auto shadow-2xl flex flex-col gap-3">
            
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-xl font-black text-red-600">Select Emergency</h3>
              <button onClick={() => setShowSOSPanel(false)} className="text-gray-400 font-bold text-2xl hover:text-gray-800">×</button>
            </div>

            <button 
              onClick={() => dispatchEmergency("General Life-Threatening Emergency")} 
              className="w-full bg-red-600 text-white font-black py-4 rounded-xl text-lg shadow-lg hover:bg-red-700 animate-pulse border-2 border-red-400"
            >
              🚨 JUST SEND HELP (No Time)
            </button>

            <div className="flex items-center gap-4 my-2">
              <div className="h-px bg-gray-200 flex-grow"></div>
              <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Or Specify</span>
              <div className="h-px bg-gray-200 flex-grow"></div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => dispatchEmergency("Medical Emergency")} className="bg-gray-100 hover:bg-red-50 text-gray-800 font-bold py-4 px-2 rounded-xl border border-gray-200 flex flex-col items-center gap-1">
                <span className="text-3xl">🚑</span> Medical
              </button>
              <button onClick={() => dispatchEmergency("Boat Sinking / Capsized")} className="bg-gray-100 hover:bg-blue-50 text-gray-800 font-bold py-4 px-2 rounded-xl border border-gray-200 flex flex-col items-center gap-1">
                <span className="text-3xl">🌊</span> Sinking Boat
              </button>
              <button onClick={() => dispatchEmergency("Poachers Spotted")} className="bg-gray-100 hover:bg-orange-50 text-gray-800 font-bold py-4 px-2 rounded-xl border border-gray-200 flex flex-col items-center gap-1">
                <span className="text-3xl">🦏</span> Poachers
              </button>
              <button onClick={() => dispatchEmergency("Wildlife Rescue")} className="bg-gray-100 hover:bg-emerald-50 text-gray-800 font-bold py-4 px-2 rounded-xl border border-gray-200 flex flex-col items-center gap-1">
                <span className="text-3xl">🦌</span> Animal Rescue
              </button>
            </div>

          </div>
        </div>
      )}

      {/* BOTTOM NAVIGATION BAR */}
      <nav className="bg-white border-t border-gray-200 flex justify-around items-center flex-shrink-0 z-[1000] shadow-[0_-4px_10px_rgba(0,0,0,0.05)] pb-safe">
        <button onClick={() => setActiveTab('map')} className={`flex flex-col items-center p-3 w-1/3 transition-colors ${activeTab === 'map' ? 'text-emerald-600 border-t-2 border-emerald-600 bg-emerald-50/50' : 'text-gray-500 hover:bg-gray-50'}`}><span className="text-2xl mb-1">🗺️</span><span className="text-xs font-bold">Map</span></button>
        <button onClick={() => setActiveTab('homestays')} className={`flex flex-col items-center p-3 w-1/3 transition-colors ${activeTab === 'homestays' ? 'text-emerald-600 border-t-2 border-emerald-600 bg-emerald-50/50' : 'text-gray-500 hover:bg-gray-50'}`}><span className="text-2xl mb-1">🏡</span><span className="text-xs font-bold">Stays</span></button>
        <button onClick={() => setActiveTab('sos')} className={`flex flex-col items-center p-3 w-1/3 transition-colors ${activeTab === 'sos' ? 'text-red-600 border-t-2 border-red-600 bg-red-50/50' : 'text-gray-500 hover:bg-gray-50'}`}><span className="text-2xl mb-1">🚨</span><span className="text-xs font-bold">SOS</span></button>
      </nav>

      {/* Report Trash Modal */}
      {isReporting && (
        <div className="absolute inset-0 z-[2000] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-4 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center"><h2 className="text-2xl font-bold text-gray-800">Report Pollution</h2><button onClick={() => setIsReporting(false)} className="text-gray-400 hover:text-black font-bold text-2xl">×</button></div>
            <div className={`text-sm font-medium p-2 rounded ${location ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{location ? `📍 GPS Secured: ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : '⏳ Locating you...'}</div>
            <input type="file" accept="image/*" capture="environment" id="camera-input" className="hidden" onChange={(e) => setFile(e.target.files[0])} />
            <label htmlFor="camera-input" className={`border-2 border-dashed rounded-lg h-32 flex flex-col items-center justify-center cursor-pointer transition-colors ${file ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-300 bg-gray-50 hover:bg-gray-100 text-gray-500'}`}><span className="text-3xl mb-1">{file ? '✅' : '📷'}</span><span className="font-semibold">{file ? 'Photo Attached' : 'Tap to take photo'}</span></label>
            <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="p-3 border border-gray-300 rounded-lg bg-white w-full text-gray-700 font-medium focus:outline-none">
              <option value="">Select Severity...</option>
              <option value="low">🟢 Low (A few bottles)</option>
              <option value="medium">🟠 Medium (Scattered trash)</option>
              <option value="critical">🔴 Critical (Large dump)</option>
            </select>
            <button onClick={submitReport} disabled={isUploading} className={`font-bold py-3.5 rounded-lg w-full mt-2 shadow-md text-white transition-colors ${isUploading ? 'bg-gray-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'}`}>{isUploading ? 'Uploading...' : 'Submit Report'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;