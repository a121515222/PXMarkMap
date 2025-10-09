
let map;
let markers = {};
let infoWindow;
let allStoreData = []; // 改為儲存後端回傳的店家資料
let userLocation = null;
const DEFAULT_LOCATION = { lat: 25.0330, lng: 121.5654 };

// 後端 API 網址
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
const googleMapApiKey = import.meta.env.VITE_GOOGLE_MAP_KEY;

// 取得使用者位置
function getUserLocation() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            console.log("瀏覽器不支援定位功能");
            resolve(DEFAULT_LOCATION);
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const userPos = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                userLocation = userPos;
                resolve(userPos);
            },
            (error) => {
                console.log("定位失敗或使用者拒絕:", error.message);
                resolve(DEFAULT_LOCATION);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 300000
            }
        );
    });
}

// 移動到使用者位置
function moveToUserLocation() {
    if (userLocation) {
        map.setCenter(userLocation);
        map.setZoom(16);
        console.log("手動移動到使用者位置:", userLocation);
        
        clearUserMarker();
        
        window.userLocationMarker = new google.maps.Marker({
            position: userLocation,
            map: map,
            title: "您的位置",
            icon: {
                url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
                        <circle cx="12" cy="12" r="8" fill="#4285F4" stroke="white" stroke-width="2"/>
                        <circle cx="12" cy="12" r="3" fill="white"/>
                    </svg>
                `),
                scaledSize: new google.maps.Size(24, 24),
                anchor: new google.maps.Point(12, 12)
            },
            animation: google.maps.Animation.DROP
        });
    } else {
        alert("無法取得您的位置資訊，請檢查瀏覽器定位權限設定。");
    }
}

function clearUserMarker() {
    if (window.userLocationMarker) {
        window.userLocationMarker.setMap(null);
        window.userLocationMarker = null;
    }
}

// 初始化地圖
async function initMap() {
    const { Map } = await google.maps.importLibrary("maps");
    const initialLocation = await getUserLocation();
    
    map = new Map(document.getElementById('map'), {
        center: initialLocation,
        zoom: 12,
        mapId: "DEMO_MAP_ID"
    });

    infoWindow = new google.maps.InfoWindow();

    // document.getElementById("search-btn").addEventListener("click", handleSearch);
    // document.getElementById("clear-btn").addEventListener("click", clearSearch);
    document.getElementById("my-location-btn").addEventListener("click", moveToUserLocation);
    // document.getElementById("product-search-input").addEventListener("keydown", (e) => {
    //     if(e.key === "Enter") handleSearch();
    // });
    
    document.getElementById('toggle-sidebar-btn')?.addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('hidden');
    });
    handleLoadData();
}

// 從後端 API 載入資料
async function handleLoadData() {
    setLoading(true, "正在從後端載入資料...");
    console.log("API_BASE_URL",API_BASE_URL)
    try {
        const response = await fetch(`${API_BASE_URL}/api/shopeMap`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        console.log("response", response)
        const data = await response.json();
        console.log("從後端接收到的資料:", data);
        
        if (!data || data.length === 0) {
            handleLoadingError("後端未返回任何資料。");
            return;
        }
        
        allStoreData = data;
        
        if (window.innerWidth >= 640) {
            document.getElementById("store-list-container").classList.remove("hidden");
        }
        
        displayStores(allStoreData);
        
    } catch (error) {
        console.error("載入資料失敗:", error);
        handleLoadingError(`載入失敗: ${error.message}`);
    }
}

// 顯示店家標記
async function displayStores(storeData) {
    console.log("displayStores called with:", storeData.length, "stores");
    
    clearMarkers();
    clearUserMarker();
    
    const storeListEl = document.getElementById("store-list");
    storeListEl.innerHTML = "";

    try {
        const bounds = new google.maps.LatLngBounds();

        // 建立側邊欄和標記
        storeData.forEach(store => {
            const { storeName, address, latitude, longitude, shipments } = store;
            
            if (!latitude || !longitude) {
                console.warn(`店家 ${storeName} 缺少經緯度資料`);
                logError(`${storeName} (缺少經緯度)`);
                return;
            }

            const position = { lat: latitude, lng: longitude };

            // 建立標記
            const marker = new google.maps.Marker({
                position: position,
                map: map,
                title: storeName,
            });
            
            markers[storeName] = marker;
            bounds.extend(position);

            // 建立側邊欄項目
            const div = document.createElement("div");
            div.className = "p-2 border-b cursor-pointer hover:bg-gray-100";
            div.textContent = `${storeName}`;
            div.style.color = "green";
            storeListEl.appendChild(div);

            // 點擊側邊欄定位 marker
            div.addEventListener("click", () => {
                map.setZoom(16);
                map.panTo(marker.position);
                google.maps.event.trigger(marker, "click");
            });

            // 點擊 marker 顯示 infoWindow
            marker.addListener("click", () => {
                updateInfoWindowWithData(storeName, address, shipments, marker);
            });
        });

        console.log("Total markers created:", Object.keys(markers).length);

        if (!bounds.isEmpty()) {
            map.fitBounds(bounds);
            console.log("Map bounds fitted");
            
            // 載入完成後，如果有使用者位置，則移動到使用者位置
            if (userLocation) {
                setTimeout(() => {
                    map.setCenter(userLocation);
                    map.setZoom(14);
                    console.log("地圖已移動到使用者位置:", userLocation);
                }, 1000);
            }
        } else {
            console.log("No valid bounds to fit");
            if (userLocation) {
                map.setCenter(userLocation);
                map.setZoom(12);
            }
        }

    } catch (error) {
        console.error("Error in displayStores:", error);
        logError(`系統錯誤: ${error.message}`);
    }
    
    setLoading(false);
}

// 更新 InfoWindow，顯示完整出貨資料
function updateInfoWindowWithData(storeName, address, shipments, anchor) {
    // 將空字串數量轉為 0
    const normalizedShipments = shipments.map(s => ({
        ...s,
        quantity: s.quantity === "" ? 0 : s.quantity
    }));

    // 生成表格內容
    let tableRows = '';
    normalizedShipments.forEach(shipment => {
        tableRows += `<tr>
                        <td>${shipment.date}</td>
                        <td>${shipment.productType}</td>
                        <td>${shipment.quantity}</td>
                      </tr>`;
    });

    const content = `
        <div>
            <h3>${storeName}</h3>
            <p style="font-size: 12px; color: #666;">${address}</p>
            <table border="1" style="border-collapse: collapse; width: 100%;">
                <thead>
                    <tr><th>日期</th><th>產品</th><th>數量</th></tr>
                </thead>
                <tbody>
                    ${tableRows || '<tr><td colspan="3">無出貨資料</td></tr>'}
                </tbody>
            </table>
        </div>
    `;

    infoWindow.setContent(content);
    infoWindow.open({ map, anchor, shouldFocus: false });
}

// 清除 markers
function clearMarkers() {
    for(const id in markers){
       markers[id].setMap(null);
    }
    markers = {};
    document.getElementById("store-list").innerHTML = "";
    // document.getElementById("error-log").innerHTML = "";
}

// 搜尋功能 - 根據商品類型或店名搜尋
// function handleSearch(){
//     const term = document.getElementById("product-search-input").value.trim().toLowerCase();
//     if(!term) return;

//     const filtered = allStoreData.filter(store => {
//         // 搜尋店名
//         if(store.storeName.toLowerCase().includes(term)) {
//             return true;
//         }
        
//         // 搜尋商品類型
//         return store.shipments.some(shipment => 
//             shipment.productType.toLowerCase().includes(term)
//         );
//     });

//     document.getElementById("search-status").textContent = 
//         `找到 ${filtered.length} 個符合「${term}」的店家。`;
//     displayStores(filtered);
// }

// function clearSearch(){
//     document.getElementById("product-search-input").value = "";
//     document.getElementById("search-status").textContent = "";
//     displayStores(allStoreData);
// }

// Loading
function setLoading(isLoading, text=""){
    const overlay = document.getElementById("loading-overlay");
    const loadingText = document.getElementById("loading-text");
    if(isLoading){
        overlay.style.display = "flex";
        loadingText.textContent = text;
    } else {
        overlay.style.display = "none";
    }
}

// 顯示錯誤
function handleLoadingError(msg){
    setLoading(false);
    document.getElementById("url-error").textContent = msg;
}

function logError(msg){
    const errorLog = document.getElementById("error-log");
    const errorTitle = document.getElementById("error-title");
    errorTitle.style.display = "block";
    const p = document.createElement("p");
    p.textContent = msg;
    errorLog.appendChild(p);
}

// Google Maps API 載入
((g) => {
    var h, a, k, p = "The Google Maps JavaScript API",
        c = "google", l = "importLibrary", q = "__ib__",
        m = document, b = window
    b = b[c] || (b[c] = {})
    var d = b.maps || (b.maps = {}),
        r = new Set(), e = new URLSearchParams(),
        u = () => h || (h = new Promise(async (f, n) => {
            await (a = m.createElement("script"))
            e.set("libraries", [...r] + "")
            for (k in g)
                e.set(k.replace(/[A-Z]/g, (t) => "_" + t.toLowerCase()), g[k])
            e.set("callback", c + ".maps." + q)
            a.src = `https://maps.${c}apis.com/maps/api/js?` + e
            d[q] = f
            a.onerror = () => (h = n(Error(p + " could not load.")))
            a.nonce = m.querySelector("script[nonce]")?.nonce || ""
            m.head.append(a)
        }))
    d[l] ? console.warn(p + " only loads once. Ignoring:", g)
        : (d[l] = (f, ...n) => r.add(f) && u().then(() => d[l](f, ...n)))
})({ key: googleMapApiKey, v: "weekly" })

initMap();