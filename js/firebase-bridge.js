(function() {
    console.log("🚀 Firebase Bridge Module Initialized...");

  
    function getFmgDB() {
        if (window.fmgDB && window.fmgCloudReady) {
            return window.fmgDB;
        }
        return null;
    }
    document.addEventListener("DOMContentLoaded", () => {
        const createAccountBtn = document.getElementById("createAccountBtn") || document.querySelector('form[id*="signup"] button[type="submit"]');
        
        if (createAccountBtn) {
            createAccountBtn.addEventListener("click", function(e) {
                const db = getFmgDB();
                if (!db) return; 

              
                const businessPayload = {
                    id: "biz_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
                    name: document.getElementById("businessName")?.value || "",
                    email: document.getElementById("businessEmail")?.value || "",
                    category: document.getElementById("businessCategory")?.value || "",
                    location: document.getElementById("businessLocation")?.value || "",
                    description: document.getElementById("businessDescription")?.value || "",
                    joinedDate: new Date().toISOString().split('T')[0],
                    bFreeTrial: true
                };

                // Validate that a blank name record isn't being pushed accidentally
                if (!businessPayload.name || !businessPayload.email) return;

                // Sync directly up to your Firestore database collection tree
                db.collection("businesses").doc(String(businessPayload.id)).set(businessPayload)
                    .then(() => console.log("New Business successfully pushed to Cloud!"))
                    .catch(err => console.error(" Cloud sync failed for business: ", err));
            });
        }

        // INTERCEPT 2: Monitor Product Upload Multi-part Form Submissions
        const uploadProductBtn = document.getElementById("saveProductBtn") || document.querySelector('form[id*="product"] button[type="submit"]');
        
        if (uploadProductBtn) {
            uploadProductBtn.addEventListener("click", function(e) {
                const db = getFmgDB();
                if (!db) return;

                const productPayload = {
                    id: "prod_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
                    title: document.getElementById("productTitle")?.value || document.getElementById("prodName")?.value || "",
                    price: parseFloat(document.getElementById("productPrice")?.value || 0),
                    category: document.getElementById("productCategory")?.value || "",
                    description: document.getElementById("productDescription")?.value || "",
                    imageUrl: document.getElementById("productImageUrl")?.value || "placeholder.png",
                    timestamp: Date.now()
                };

                if (!productPayload.title || productPayload.price === 0) return;

                db.collection("products").doc(String(productPayload.id)).set(productPayload)
                    .then(() => console.log(" New Product catalog successfully pushed to Cloud!"))
                    .catch(err => console.error("Cloud sync failed for product: ", err));
            });
        }
    });

    
    document.addEventListener("fmg:updated", () => {
        console.log("Background update intercepted! Refreshing Dashboard Counters...");
        
    
        try {
            const rawBusinesses = localStorage.getItem("fmg_registered_businesses");
            const businessList = rawBusinesses ? JSON.parse(rawBusinesses) : [];
            const businessCounterEl = document.getElementById("registeredBusinessesCount") || document.querySelector('.card:nth-child(2) h1');
            if (businessCounterEl && Array.isArray(businessList)) {
                businessCounterEl.innerText = businessList.length;
            }
        } catch(e) {}

      
        try {
            const rawProducts = localStorage.getItem("fmg_products");
            const productList = rawProducts ? JSON.parse(rawProducts) : [];
            const slotCounterEl = document.getElementById("freeTrialSlotsCount") || document.querySelector('.card:nth-child(4) h1');
            if (slotCounterEl && Array.isArray(productList)) {
                const slotsLeft = Math.max(0, 100 - productList.length);
                slotCounterEl.innerText = `${slotsLeft} / 100 left`;
            }
        } catch(e) {}
    });
})();
