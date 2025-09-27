import Papa from "papaparse";
import goodsId from "./goods";
let map;
let markers = {};
let infoWindow;
let headerRow = [];
let allStoreRows = [];
let userLocation = null; // 儲存使用者位置
const DEFAULT_LOCATION = { lat: 25.0330, lng: 121.5654 }; // 預設台北位置
// Google Sheet ID 和多分頁 GID
const sheetId = import.meta.env.VITE_GOOGLE_SHEET_ID

// 取得使用者位置
const googleMapApiKey = import.meta.env.VITE_GOOGLE_MAP_KEY;
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
                switch(error.code) {
                    case error.PERMISSION_DENIED:
                        console.log("使用者拒絕定位請求");
                        break;
                    case error.POSITION_UNAVAILABLE:
                        console.log("位置資訊無法取得");
                        break;
                    case error.TIMEOUT:
                        console.log("定位請求逾時");
                        break;
                    default:
                        console.log("定位發生未知錯誤");
                        break;
                }
                resolve(DEFAULT_LOCATION);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000, // 10秒逾時
                maximumAge: 300000 // 5分鐘內的快取位置可接受
            }
        );
    });
}
// 移動到使用者位置的函數
function moveToUserLocation() {
    console.log("moveToUserLocation")
    if (userLocation) {
        map.setCenter(userLocation);
        map.setZoom(16); // 設定較近的縮放級別
        console.log("手動移動到使用者位置:", userLocation);
        
        // 可選：在使用者位置顯示一個臨時標記
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
        
        // 5秒後移除使用者位置標記
    } else {
        alert("無法取得您的位置資訊，請檢查瀏覽器定位權限設定。");
        console.log("嘗試重新取得使用者位置...");
        // 嘗試重新取得位置
        getUserLocation().then(location => {
            userLocation = location;
            if (userLocation.lat !== DEFAULT_LOCATION.lat || userLocation.lng !== DEFAULT_LOCATION.lng) {
                moveToUserLocation(); // 遞迴呼叫
            } else {
                alert("無法取得精確位置，已移動到預設位置（台北）。");
                map.setCenter(DEFAULT_LOCATION);
                map.setZoom(12);
            }
        });
    }
}
function clearUserMarker () {
    if (window.userLocationMarker) {
            window.userLocationMarker.setMap(null);
            window.userLocationMarker = null; // 清理引用
        }
}
// 初始化地圖
async function initMap() {
    const { Map } = await google.maps.importLibrary("maps");
     const initialLocation = await getUserLocation();
    map = new Map(document.getElementById('map'), {
        center: initialLocation,
        zoom: 12,
        mapId: "DEMO_MAP_ID" // 使用 Google 提供的測試 Map ID
    });

    infoWindow = new google.maps.InfoWindow();

    document.getElementById("load-sheet-btn").addEventListener("click", handleLoadData);
    document.getElementById("search-btn").addEventListener("click", handleSearch);
    document.getElementById("clear-btn").addEventListener("click", clearSearch);
    document.getElementById("my-location-btn").addEventListener("click", moveToUserLocation);
    document.getElementById("product-search-input").addEventListener("keydown", (e) => {
        if(e.key === "Enter") handleSearch();
    });
}
    document.getElementById('toggle-sidebar-btn')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('hidden');
});
// 讀取多分頁 CSV
async function handleLoadData() {
    setLoading(true, "正在載入資料...");
    allStoreRows = [];
    headerRow = [];

    for (let sheet of goodsId) {
        const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&id=${sheetId}&gid=${sheet.gid}`;
        await new Promise(resolve => {
            Papa.parse(url, {
                download: true,
                header: false,
                skipEmptyLines: true,
                complete: (results) => {
                    if (results.data.length > 1) {
                        if (headerRow.length === 0) headerRow = results.data[0];
                        // 將商品名稱加入每列資料
                        const rowsWithGoods = results.data.slice(1).map(row => {
                            return [...row, sheet.goods];
                        });
                        allStoreRows = allStoreRows.concat(rowsWithGoods);
                    }
                    resolve();
                },
                error: () => resolve()
            });
        });
    }

    if (allStoreRows.length === 0) {
        handleLoadingError("CSV 資料空或無法載入。");
        return;
    }

    // document.getElementById("search-container").classList.remove("hidden");
   if (window.innerWidth >= 640) {
    document.getElementById("store-list-container").classList.remove("hidden");
  }
    displayStores(allStoreRows);
}

function summarizeStores(allStoreRows, latestDays = 3) {
    const storeMap = {};

    allStoreRows.forEach(row => {
        const storeName = row[0];
        const goods = row[row.length - 1]; // 最後一欄是商品名稱
        const shipments = row.slice(1, -1); // 中間是各日期出貨資訊

        if (!storeMap[storeName]) storeMap[storeName] = {};

        if (!storeMap[storeName][goods]) storeMap[storeName][goods] = [];

        shipments.forEach((info, i) => {
            const dateStr = headerRow[i + 1]; // 對應 headerRow 的日期
            if (!info || !dateStr) return;

            let quantity = info.split(":")[1]?.trim() || info.trim();
            quantity = parseInt(quantity) || 0;

            storeMap[storeName][goods].push({
                date: new Date(dateStr),
                quantity
            });
        });
    });

    // 只保留最新 N 天
    for (const store in storeMap) {
        for (const goods in storeMap[store]) {
            storeMap[store][goods].sort((a, b) => b.date - a.date);
            storeMap[store][goods] = storeMap[store][goods].slice(0, latestDays);
        }
    }

    return storeMap;
}
async function displayStores(storeRows) {
    console.log("displayStores called with:", storeRows.length, "rows");
    
    // 先清除舊的 markers
    clearMarkers();
    clearUserMarker();
    const storeListEl = document.getElementById("store-list");
    storeListEl.innerHTML = "";

    try {
        const { Place } = await google.maps.importLibrary("places");
        const bounds = new google.maps.LatLngBounds();

        // 先建立每個店家的所有資料群組
        const storeGroups = {};
        storeRows.forEach(row => {
            const storeName = row[0];
            if (!storeName) return;
            if (!storeGroups[storeName]) storeGroups[storeName] = [];
            storeGroups[storeName].push(row);
        });

        console.log("Store groups:", Object.keys(storeGroups));

        const storeNames = Object.keys(storeGroups);
        const BATCH_SIZE = 50; // 每批處理5家店，避免API限制
        const BATCH_DELAY = 100; // 每批之間延遲500ms

        // 先建立所有側邊欄項目
        const divElements = {};
        storeNames.forEach(storeName => {
            const div = document.createElement("div");
            div.className = "p-2 border-b cursor-pointer hover:bg-gray-100";
            div.textContent = `${storeName} (等待搜尋...)`;
            storeListEl.appendChild(div);
            divElements[storeName] = div;
        });

        // 分批處理
        for (let i = 0; i < storeNames.length; i += BATCH_SIZE) {
            const batch = storeNames.slice(i, i + BATCH_SIZE);
            console.log(`Processing batch ${Math.floor(i/BATCH_SIZE) + 1}: ${batch.join(', ')}`);

            // 建立當前批次的搜尋Promise
            const batchPromises = batch.map(storeName => {
                const div = divElements[storeName];
                div.textContent = `${storeName} (搜尋中...)`;
                div.style.color = "blue";

                const query = `全聯${storeName}店`;
                console.log(`Searching for: ${query}`);

                return Place.searchByText({
                    textQuery: query,
                    fields: ["displayName", "location", "businessStatus", "formattedAddress"],
                    locationBias: userLocation || map.getCenter(),
                    maxResultCount: 1,
                    language: "zh-TW"
                }).then(result => {
                    return {
                        storeName: storeName,
                        storeData: storeGroups[storeName],
                        result: result,
                        div: div
                    };
                }).catch(error => {
                    return {
                        storeName: storeName,
                        storeData: storeGroups[storeName],
                        error: error,
                        div: div
                    };
                });
            });

            // 等待當前批次完成
            const batchResults = await Promise.all(batchPromises);

            // 處理當前批次結果
            batchResults.forEach(({ storeName, storeData, result, error, div }) => {
                if (error) {
                    console.error(`Places API error for ${storeName}:`, error);
                    div.textContent = `${storeName} (查詢失敗)`;
                    div.style.color = "red";
                    logError(`${storeName} (查詢失敗: ${error.message})`);
                    return;
                }

                if (!result.places || result.places.length === 0) {
                    div.textContent = `${storeName} (找不到位置)`;
                    div.style.color = "orange";
                    logError(`${storeName} (找不到位置)`);
                    return;
                }

                const place = result.places[0];

                // 使用傳統的 google.maps.Marker
                const marker = new google.maps.Marker({
                    position: place.location,
                    map: map,
                    title: storeName,
                });
                
                markers[storeName] = marker;
                bounds.extend(place.location);

                // 更新側邊欄狀態
                div.textContent = `${storeName} ✓`;
                div.style.color = "green";

                // 點擊側邊欄定位 marker
                div.addEventListener("click", () => {
                    map.setZoom(16);
                    map.panTo(marker.position);
                    google.maps.event.trigger(marker, "click");
                });

                // 點擊 marker 顯示 infoWindow
                marker.addListener("click", () => {
                    updateInfoWindowWithData(storeName, storeData, marker);
                });

            });

            // 批次間延遲，避免API限制
            if (i + BATCH_SIZE < storeNames.length) {
                console.log(`Waiting ${BATCH_DELAY}ms before next batch...`);
                await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
            }
        }

        console.log("Total markers created:", Object.keys(markers).length);

       if (!bounds.isEmpty()) {
            map.fitBounds(bounds);
            console.log("Map bounds fitted");
            
            // 載入完成後，如果有使用者位置，則移動到使用者位置
            if (userLocation) {
                setTimeout(() => {
                    map.setCenter(userLocation);
                    map.setZoom(14); // 設定較近的縮放級別
                    console.log("地圖已移動到使用者位置:", userLocation);
                }, 1000); // 延遲1秒讓fitBounds先完成
            }
        } else {
            console.log("No valid bounds to fit");
            // 如果沒有有效bounds但有使用者位置，直接移動到使用者位置
            if (userLocation) {
                map.setCenter(userLocation);
                map.setZoom(12);
                console.log("地圖已移動到使用者位置:", userLocation);
            }
        }

    } catch (error) {
        console.error("Error in displayStores:", error);
        logError(`系統錯誤: ${error.message}`);
    }
    
    setLoading(false);
}
// infoWindow 更新
function updateInfoWindow(storeName, goods, anchor) {
    infoWindow.setContent(`<strong>${storeName}</strong><br>商品: ${goods}`);
    infoWindow.open({
        map,
        anchor,
        shouldFocus: false
    });
}

// 更新 InfoWindow，顯示完整出貨資料
function updateInfoWindowWithData(storeName, rowsData, anchor) {
    // 收集所有出貨記錄並按日期排序
    const allRecords = [];

    rowsData.forEach(rowData => {
        const product = rowData[rowData.length - 1]; // 最後一欄是商品名稱

        for (let i = 1; i < headerRow.length; i++) {
            const cell = rowData[i];
            if (!cell) continue;

            // 嘗試解析 headerRow[i] 為日期
            const dateStr = headerRow[i];
            const dateObj = new Date(dateStr.replace(/\//g, "-")); // 2025/9/24 → 2025-9-24
            if (isNaN(dateObj.getTime())) continue;

            // 數量處理
            let quantity = '';
            if (cell.includes(":")) {
                const parts = cell.split(":");
                quantity = parts[1] || '';
            } else {
                quantity = cell;
            }

            allRecords.push({
                date: dateObj,
                dateStr: dateStr,
                product: product,
                quantity: quantity
            });
        }
    });

    // 按日期降序排序（最新的在前）
    allRecords.sort((a, b) => b.date - a.date);

    // 只取最新的3天
    const latestDates = [...new Set(allRecords.map(r => r.dateStr))].slice(0, 3);
    const filteredRecords = allRecords.filter(r => latestDates.includes(r.dateStr));

    // 生成表格內容
    let tableRows = '';
    filteredRecords.forEach(record => {
        tableRows += `<tr>
                        <td>${record.dateStr}</td>
                        <td>${record.product}</td>
                        <td>${record.quantity}</td>
                      </tr>`;
    });

    const content = `
        <div>
            <h3>${storeName}</h3>
            <p style="font-size: 12px; color: #666;">顯示最新 3 天的出貨資料</p>
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
    document.getElementById("error-log").innerHTML = "";
}

// 搜尋
function handleSearch(){
    const term = document.getElementById("product-search-input").value.trim();
    if(!term) return;

    const filtered = allStoreRows.filter(row=>{
        if(!row || row.length <= 1) return false;
        for(let i=1;i<row.length;i++){
            if(row[i] && row[i].split(":")[0].trim().toLowerCase().includes(term.toLowerCase())){
                return true;
            }
        }
        return false;
    });

    document.getElementById("search-status").textContent = `找到 ${filtered.length} 個符合「${term}」的店家。`;
    displayStores(filtered);
}

function clearSearch(){
    document.getElementById("product-search-input").value = "";
    document.getElementById("search-status").textContent = "";
    displayStores(allStoreRows);
}

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

((g) => {
      var h,
        a,
        k,
        p = "The Google Maps JavaScript API",
        c = "google",
        l = "importLibrary",
        q = "__ib__",
        m = document,
        b = window
      b = b[c] || (b[c] = {})
      var d = b.maps || (b.maps = {}),
        r = new Set(),
        e = new URLSearchParams(),
        u = () =>
          h ||
          (h = new Promise(async (f, n) => {
            await (a = m.createElement("script"))
            e.set("libraries", [...r] + "")
            for (k in g)
              e.set(
                k.replace(/[A-Z]/g, (t) => "_" + t.toLowerCase()),
                g[k]
              )
            e.set("callback", c + ".maps." + q)
            a.src = `https://maps.${c}apis.com/maps/api/js?` + e
            d[q] = f
            a.onerror = () => (h = n(Error(p + " could not load.")))
            a.nonce = m.querySelector("script[nonce]")?.nonce || ""
            m.head.append(a)
          }))
      d[l]
        ? console.warn(p + " only loads once. Ignoring:", g)
        : (d[l] = (f, ...n) => r.add(f) && u().then(() => d[l](f, ...n)))
    })({ key: googleMapApiKey, v: "weekly" })

initMap();