

let customProducts=[];

let cart=JSON.parse(localStorage.getItem("jexaliCart")||"[]");
let sales=Number(localStorage.getItem("jexaliSales")||0);
let sellerRevenue=Number(localStorage.getItem("jexaliSellerRevenue")||0);
let jexaliRevenue=Number(localStorage.getItem("jexaliRevenue")||0);

const allProducts=()=>[...customProducts];
fetch('/api/products')
.then(res=>res.json())
.then(products=>{

  customProducts=products;
  renderShop();

  const sharedProductId =
    new URLSearchParams(window.location.search)
      .get("product");

  if(sharedProductId){

    go("shop");

    setTimeout(() => {
      openProductModal(sharedProductId);
    }, 100);

  }

});
  
const money=n=>"$"+Number(n).toFixed(2);

function go(view){
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  document.getElementById(view).classList.add("active");
  window.scrollTo({top:0,behavior:"smooth"});
  if(view==="shop") renderShop();
  if(view==="dashboard") renderDashboard();
  if(view==="myorders") renderBuyerOrders();
  if(view==="cart") renderCart();
}
document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.view)));

function cardHTML(p, seller=false){
  return `<article class="card" data-product-id="${p.id}">
    ${p.image?`<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" class="product-image-clickable">`:`<div class="placeholder">🛍️</div>`}
    <div class="card-body">
      <div class="category">${escapeHtml(p.category)}</div>
      <h3>${escapeHtml(p.name)}</h3>
      <p>${escapeHtml(p.desc)}</p>
      <div class="price">${money(p.price)}</div>
      ${seller
  ? `
   <button class="primary share-product" data-id="${p.id}">
  <i class="fa-solid fa-share-nodes"></i>
  <span>Share Product</span>
</button> 

    <button class="secondary remove-product" data-id="${p.id}">
      Remove listing
    </button>
  `
  : Number(p.stock) <= 0
          ? `<button class="primary" disabled>Out of Stock</button>`
          : `<button class="primary add-cart" data-id="${p.id}">Add to Cart</button>`
      }
    </div>
  </article>`;
}
function escapeHtml(s){return String(s||"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
let activeProduct = null;

function openProductModal(id){
  const p = allProducts().find(
    product => String(product.id) === String(id)
  );

  if(!p) return;

  activeProduct = p;

  document.getElementById("modalProductImage").src =
    p.image || "";

  document.getElementById("modalProductName").textContent =
    p.name || "";

  document.getElementById("modalProductCategory").textContent =
    p.category || "";

  document.getElementById("modalProductDescription").textContent =
    p.desc || p.description || "";

  document.getElementById("modalProductPrice").textContent =
    money(p.price);
  const optionSets = [
    {
      groupId: "modalColorGroup",
      listId: "modalColors",
      values: Array.isArray(p.colors) ? p.colors : []
    },
    {
      groupId: "modalClothingSizeGroup",
      listId: "modalClothingSizes",
      values: Array.isArray(p.clothing_sizes) ? p.clothing_sizes : []
    },
    {
      groupId: "modalShoeSizeGroup",
      listId: "modalShoeSizes",
      values: Array.isArray(p.shoe_sizes) ? p.shoe_sizes : []
    },
    {
      groupId: "modalWaistSizeGroup",
      listId: "modalWaistSizes",
      values: Array.isArray(p.waist_sizes) ? p.waist_sizes : []
    }
  ];

  optionSets.forEach(option => {
    const group = document.getElementById(option.groupId);
    const list = document.getElementById(option.listId);

    if(option.values.length === 0){
      group.style.display = "none";
      list.innerHTML = "";
      return;
    }

    group.style.display = "";

    list.innerHTML = option.values.map(value => `
      <button
        type="button"
        class="product-option-btn"
        data-value="${escapeHtml(value)}"
      >
        ${escapeHtml(value)}
      </button>
    `).join("");

    list.querySelectorAll(".product-option-btn")
      .forEach(button => {
        button.addEventListener("click", () => {
          list.querySelectorAll(".product-option-btn")
            .forEach(btn => btn.classList.remove("selected"));

          button.classList.add("selected");
        });
      });
  });
  document.getElementById("productModal")
    .classList.add("open");
}

document.addEventListener("click", e => {
  if(e.target.classList.contains("product-image-clickable")){
    const card = e.target.closest(".card");

    if(card){
      openProductModal(card.dataset.productId);
    }
  }
});

document.getElementById("closeProductModal")
  .addEventListener("click", () => {
    document.getElementById("productModal")
      .classList.remove("open");

    activeProduct = null;
  });

document.querySelector(".product-modal-overlay")
  .addEventListener("click", () => {
    document.getElementById("productModal")
      .classList.remove("open");

    activeProduct = null;
  });
function renderShop(){
  const q=document.getElementById("searchInput").value.toLowerCase().trim();
  const items=allProducts().filter(p=>(p.name+" "+p.category+" "+p.desc).toLowerCase().includes(q));
  document.getElementById("productGrid").innerHTML=items.length?items.map(p=>cardHTML(p)).join(""):"<p>No products found.</p>";
document.querySelectorAll(".add-cart").forEach(b=>{
  b.addEventListener("click",()=>{
    const p=allProducts().find(
      x=>String(x.id)===String(b.dataset.id)
    );

    const hasOptions = p && (
      (Array.isArray(p.colors) && p.colors.length > 0) ||
      (Array.isArray(p.clothing_sizes) && p.clothing_sizes.length > 0) ||
      (Array.isArray(p.shoe_sizes) && p.shoe_sizes.length > 0) ||
      (Array.isArray(p.waist_sizes) && p.waist_sizes.length > 0)
    );

    if(hasOptions){
      openProductModal(b.dataset.id);
    }else{
      addToCart(b.dataset.id);
    }
  });
});
}
document.getElementById("searchInput").addEventListener("input",renderShop);
function getSelectedProductOptions(){
  const getSelected = (listId) => {
    const selected = document.querySelector(
      `#${listId} .product-option-btn.selected`
    );

    return selected ? selected.dataset.value : "";
  };

  return {
    color: getSelected("modalColors"),
    clothingSize: getSelected("modalClothingSizes"),
    shoeSize: getSelected("modalShoeSizes"),
    waistSize: getSelected("modalWaistSizes")
  };
}
function addToCart(id, options = {}){
  const p = allProducts().find(
    x => String(x.id) === String(id)
  );

  if(!p) return;

  cart.push({
    ...p,
    selectedColor: options.color || "",
    selectedClothingSize: options.clothingSize || "",
    selectedShoeSize: options.shoeSize || "",
    selectedWaistSize: options.waistSize || "",
    cartId: Date.now() + Math.random()
  });

  localStorage.setItem(
    "jexaliCart",
    JSON.stringify(cart)
  );

  updateCartCount();
}
  


function updateCartCount(){document.getElementById("cartCount").textContent=cart.length;}
const modalAddToCartBtn = document.getElementById("modalAddToCart");

if(modalAddToCartBtn){
  modalAddToCartBtn.addEventListener("click", () => {
    if(!activeProduct) return;

    const options = getSelectedProductOptions();

    if(
      Array.isArray(activeProduct.colors) &&
      activeProduct.colors.length > 0 &&
      !options.color
    ){
      alert("Please choose a color.");
      return;
    }

    if(
      Array.isArray(activeProduct.clothing_sizes) &&
      activeProduct.clothing_sizes.length > 0 &&
      !options.clothingSize
    ){
      alert("Please choose a size.");
      return;
    }

    if(
      Array.isArray(activeProduct.shoe_sizes) &&
      activeProduct.shoe_sizes.length > 0 &&
      !options.shoeSize
    ){
      alert("Please choose a shoe size.");
      return;
    }

    if(
      Array.isArray(activeProduct.waist_sizes) &&
      activeProduct.waist_sizes.length > 0 &&
      !options.waistSize
    ){
      alert("Please choose a waist size.");
      return;
    }

    addToCart(activeProduct.id, options);

    document.getElementById("productModal")
      .classList.remove("open");

    activeProduct = null;
  });
}
const photoUpload = document .getElementById("pPhotoUpload");
const photoFileName = document .getElementById("photoFileName");
photoUpload.addEventListener("change" , () => {
  const file = photoUpload.files[0];
  if (file) {
    photoFileName.textContent = file.name;
  } else {
    photoFileName.textContent = "No file selected";
  }
});

document.getElementById("productForm").addEventListener("submit",async e=>{
  e.preventDefault();
  
  if(!stripeConnected){alert("Please connect your Stripe account before publishing a product.");return;}
  const name=document.getElementById("pName").value.trim();
  const price=Number(document.getElementById("pPrice").value);
  const stock=Number(document.getElementById("pStock").value);
  const shippingFee=Number(document.getElementById("pShipping").value) || 0;
  const category=document.getElementById("pCategory").value;
  const colors = document.getElementById("pColors").value
  .split(",")
  .map(color => color.trim())
  .filter(Boolean);

const clothingSizes = Array.from(
  document.querySelectorAll(
    "#pClothingSizes input[type='checkbox']:checked"
  )
).map(input => input.value);

const shoeSizes = Array.from(
  document.querySelectorAll(
    "#pShoeSizes input[type='checkbox']:checked"
  )
).map(input => input.value);

const waistSizes = Array.from(
  document.querySelectorAll(
    "#pWaistSizes input[type='checkbox']:checked"
  )
).map(input => input.value);
  let image=document.getElementById("pImage").value.trim();
  const file = photoUpload.files[0];
  if (file) {
    const formData = new FormData();
    formData.append("image", file);
    const uploadResponse = await fetch("/api/upload-product-image", {
      method: "POST",
      body: formData
    });
    if (!uploadResponse.ok) {
      const err = await 
      uploadResponse.json();
      alert(err.error || "Image upload failed")
      return;
    }
    const uploadData = await
    uploadResponse.json();
    image= uploadData.url;
  }
  const desc=document.getElementById("pDesc").value.trim();
if(!name || !desc || !(price>0) || ! Number.isInteger(stock) || stock<0){document.getElementById("formMsg").textContent="Please complete all required fields.";return;}
  
  const p={
  id:"p"+Date.now(),
  name,
  price,
  stock,
  shipping_fee:shippingFee,
  category,
  image,
  desc,
  colors,
  clothing_sizes:clothingSizes,
  shoe_sizes:shoeSizes,
  waist_sizes:waistSizes
};
  const response=await fetch("/api/products",{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    
      body:JSON.stringify({
  name:name,
  price:price,
  stock:stock,
  shipping_fee:shippingFee,
  category:category,
  image:image,
  description:desc,
  colors:colors,
  clothing_sizes:clothingSizes,
  shoe_sizes:shoeSizes,
  waist_sizes:waistSizes
})
  });
if (!response.ok) { const err=await response.json(); alert(err.error || "Product could not be saved"); return; }
  const data=await response.json();p.id=data.id; 
  customProducts.unshift(p);
  localStorage.setItem("jexaliProducts",JSON.stringify(customProducts));
  e.target.reset();
  photoFileName.textContent = "No file selected";
  document.getElementById("formMsg").textContent="Product published successfully.";
  setTimeout(()=>go("dashboard"),500);
});

function renderDashboard(){
 
  fetch('/api/seller/stats')
  .then(res=>res.json())
  .then(data=>{
    if(data.error)return;
    document.getElementById("salesCount").textContent=data.sales;
    document.getElementById("earnings").textContent=money(data.sellerEarnings);
    document.getElementById("jexaliFees").textContent=money(data.jexaliFees);
  });
fetch('/api/seller/products').then(res=>res.json()).then(products=>{if(products.error) return; document.getElementById("listingCount").textContent=products.length; document.getElementById("sellerListings").innerHTML=products.length? products.map(p=>cardHTML(p,true)).join("") : "<p>No listings yet.</p>";
document.querySelectorAll(".remove-product").forEach(b=>b.onclick=async()=>{const id=String(b.dataset.id).replace(/^p/,""); const r=await fetch("/api/products/"+id, {method:"DELETE"});if(r.ok) {customProducts=customProducts.filter(p=>String(p.id)!==String(id));renderDashboard();}}); 
   document.querySelectorAll(".share-product").forEach(button => {

  button.onclick = async () => {

    const id = button.dataset.id;

    const product = allProducts().find(
      p => String(p.id) === String(id)
    );

    if(!product) return;

    const productUrl =
      `${window.location.origin}/?product=${encodeURIComponent(id)}`;

    const shareData = {
      title: product.name,
      text: `Check out ${product.name} on Jexali`,
      url: productUrl
    };

    try{

      if(navigator.share){
        await navigator.share(shareData);
      }else{
        await navigator.clipboard.writeText(productUrl);
        alert("Product link copied!");
      }

    }catch(err){

      if(err.name !== "AbortError"){
        console.error("Share error:", err);
      }

    }
  };

});                                                                 
   }); 
fetch("/api/seller/orders", {
  credentials: "include"
})
.then(res => res.json())
.then(data => {

  const orders = Array.isArray(data)
    ? data
    : (data.orders || []);

 const recentOrders = document.getElementById("sellerOrders");

if (!recentOrders) return; 

 recentOrders.innerHTML = `
  ${
    orders.length === 0
      ? `<p>No orders yet.</p>`
      : orders.map(order => {

          const shippingCityLine = [
            order.shipping_city,
            order.shipping_state,
            order.shipping_postal_code
          ].filter(Boolean).join(", ");

          const hasBuyerDetails =
            order.buyer_name ||
            order.buyer_email ||
            order.buyer_phone ||
            order.shipping_line1 ||
            order.shipping_city;
const currentStatus =
  ["New", "Shipped", "Delivered"].includes(order.status)
    ? order.status
    : "New";
     const currentCarrier =
  ["USPS", "UPS", "FedEx", "DHL", "Other"]
    .includes(order.shipping_carrier)
      ? order.shipping_carrier
      : "";

const currentTracking =
  order.tracking_number || "";   
          return `
            <div class="order-card">

              <div class="order-header">
                <strong>Order #${order.id}</strong>

                <span>
                  ${
                    order.created_at
                      ? new Date(order.created_at).toLocaleString()
                      : ""
                  }
                </span>
              </div>

  <div class="order-status-row">

  <span class="order-status-label">
    Status
  </span>

  <select
    class="order-status-select"
    data-order-id="${order.id}"
    data-current-status="${currentStatus}"
  >
    <option
      value="New"
      ${currentStatus === "New" ? "selected" : ""}
    >
      New
    </option>

    <option
      value="Shipped"
      ${currentStatus === "Shipped" ? "selected" : ""}
    >
      Shipped
    </option>

    <option
      value="Delivered"
      ${currentStatus === "Delivered" ? "selected" : ""}
    >
      Delivered
    </option>
  </select>

</div>            
<div class="order-tracking-box">

  <div class="order-tracking-fields">

    <label>
      Carrier

      <select
        class="order-carrier-select"
        data-order-id="${order.id}"
      >
        <option value="">
          Select carrier
        </option>

        <option
          value="USPS"
          ${currentCarrier === "USPS" ? "selected" : ""}
        >
          USPS
        </option>

        <option
          value="UPS"
          ${currentCarrier === "UPS" ? "selected" : ""}
        >
          UPS
        </option>

        <option
          value="FedEx"
          ${currentCarrier === "FedEx" ? "selected" : ""}
        >
          FedEx
        </option>

        <option
          value="DHL"
          ${currentCarrier === "DHL" ? "selected" : ""}
        >
          DHL
        </option>

        <option
          value="Other"
          ${currentCarrier === "Other" ? "selected" : ""}
        >
          Other
        </option>

      </select>
    </label>

    <label>
      Tracking Number

      <input
        type="text"
        class="order-tracking-input"
        data-order-id="${order.id}"
        value="${escapeHtml(currentTracking)}"
        placeholder="Enter tracking number"
      >
    </label>

  </div>

  <button
    type="button"
    class="primary save-tracking-btn"
    data-order-id="${order.id}"
  >
    Save Tracking
  </button>

  <p
    class="tracking-save-message"
    data-order-id="${order.id}"
  ></p>

</div>
              ${(order.items || []).map(item => `

                <div class="order-item">

                  <strong>
                    ${escapeHtml(item.product_name || "Product")}
                  </strong>

                  <p>
                    Quantity: ${item.quantity || 1}
                  </p>

                  ${
                    item.selected_color
                      ? `<p>Color: ${escapeHtml(item.selected_color)}</p>`
                      : ""
                  }

                  ${
                    item.selected_clothing_size
                      ? `<p>Size: ${escapeHtml(item.selected_clothing_size)}</p>`
                      : ""
                  }

                  ${
                    item.selected_shoe_size
                      ? `<p>Shoe Size: ${escapeHtml(item.selected_shoe_size)}</p>`
                      : ""
                  }

                  ${
                    item.selected_waist_size
                      ? `<p>Waist Size: ${escapeHtml(item.selected_waist_size)}</p>`
                      : ""
                  }

                  ${
                    item.unit_price != null
                      ? `<p>Price: ${money(item.unit_price)}</p>`
                      : ""
                  }

                </div>

              `).join("")}

              ${
                hasBuyerDetails
                  ? `
                    <div class="order-customer-details">

                      <div class="order-detail-box">
                        <h4>Customer</h4>

                        ${
                          order.buyer_name
                            ? `<p><strong>Name:</strong> ${escapeHtml(order.buyer_name)}</p>`
                            : ""
                        }

                        ${
                          order.buyer_email
                            ? `<p><strong>Email:</strong> ${escapeHtml(order.buyer_email)}</p>`
                            : ""
                        }

                        ${
                          order.buyer_phone
                            ? `<p><strong>Phone:</strong> ${escapeHtml(order.buyer_phone)}</p>`
                            : ""
                        }
                      </div>

                      <div class="order-detail-box">
                        <h4>Shipping Address</h4>

                        ${
                          order.shipping_name
                            ? `<p>${escapeHtml(order.shipping_name)}</p>`
                            : ""
                        }

                        ${
                          order.shipping_line1
                            ? `<p>${escapeHtml(order.shipping_line1)}</p>`
                            : ""
                        }

                        ${
                          order.shipping_line2
                            ? `<p>${escapeHtml(order.shipping_line2)}</p>`
                            : ""
                        }

                        ${
                          shippingCityLine
                            ? `<p>${escapeHtml(shippingCityLine)}</p>`
                            : ""
                        }

                        ${
                          order.shipping_country
                            ? `<p>${escapeHtml(order.shipping_country)}</p>`
                            : ""
                        }

                      </div>

                    </div>
                  `
                  : `
                    <div class="order-old-details">
                      Customer and shipping details are not available for this earlier order.
                    </div>
                  `
              }

              ${
                order.amount != null
                  ? `
                    <p class="order-total">
                      <strong>
                        Order Total: ${money(order.amount)}
                      </strong>
                    </p>
                  `
                  : ""
              }

            </div>
          `;
        }).join("")
  }
`; 

 recentOrders
  .querySelectorAll(".order-status-select")
  .forEach(select => {

    select.addEventListener("change", async () => {

      const orderId =
        select.dataset.orderId;

      const oldStatus =
        select.dataset.currentStatus || "New";

      const newStatus =
        select.value;

      select.disabled = true;

      try{

        const response = await fetch(
          `/api/seller/orders/${encodeURIComponent(orderId)}/status`,
          {
            method:"PATCH",

            headers:{
              "Content-Type":"application/json"
            },

            credentials:"include",

            body:JSON.stringify({
              status:newStatus
            })
          }
        );

        const data =
          await response.json();

        if(!response.ok){
          throw new Error(
            data.error ||
            "Could not update order status"
          );
        }

        select.dataset.currentStatus =
          data.order?.status || newStatus;

      }catch(err){

        select.value = oldStatus;

        alert(
          err.message ||
          "Could not update order status"
        );

      }finally{

        select.disabled = false;

      }

    
  });
  });
  recentOrders
  .querySelectorAll(".save-tracking-btn")
  .forEach(button => {

    button.addEventListener("click", async () => {

      const orderId =
        button.dataset.orderId;

      const trackingBox =
        button.closest(".order-tracking-box");

      if(!trackingBox) return;

      const carrier =
        trackingBox
          .querySelector(".order-carrier-select")
          .value;

      const trackingNumber =
        trackingBox
          .querySelector(".order-tracking-input")
          .value
          .trim();

      const message =
        trackingBox
          .querySelector(".tracking-save-message");

      if(!carrier){

        message.textContent =
          "Please select a carrier.";

        return;
      }

      if(trackingNumber.length < 3){

        message.textContent =
          "Please enter a valid tracking number.";

        return;
      }

      button.disabled = true;

      message.textContent =
        "Saving tracking...";

      try{

        const response = await fetch(
          `/api/seller/orders/${encodeURIComponent(orderId)}/tracking`,
          {
            method:"PATCH",

            headers:{
              "Content-Type":"application/json"
            },

            credentials:"include",

            body:JSON.stringify({
              shipping_carrier:carrier,
              tracking_number:trackingNumber
            })
          }
        );

        const data =
          await response.json();

        if(!response.ok){
          throw new Error(
            data.error ||
            "Could not save tracking"
          );
        }

        message.textContent =
          "Tracking saved successfully.";

      }catch(err){

        message.textContent =
          err.message ||
          "Could not save tracking.";

      }finally{

        button.disabled = false;

      }

    });
  });
  })
.catch(err => {
  console.error("Recent orders error:", err);
});

  
  
  
  
  


 
}
function getTrackingUrl(carrier, trackingNumber){

  const tracking = encodeURIComponent(
    String(trackingNumber || "").trim()
  );

  if(!tracking) return "";

  switch(String(carrier || "").trim().toUpperCase()){

    case "USPS":
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${tracking}`;

    case "UPS":
      return `https://www.ups.com/track?loc=en_US&tracknum=${tracking}`;

    case "FEDEX":
      return `https://www.fedex.com/fedextrack/?trknbr=${tracking}`;

    case "DHL":
      return `https://www.dhl.com/us-en/home/tracking.html?submit=1&tracking-id=${tracking}`;

    default:
      return "";
  }
}
function buyerTrackingHTML(order){

  if(!order.tracking_number){

    return `
      <div class="buyer-tracking-box tracking-pending">

        <div>
          <strong>Tracking not available yet</strong>

          <p>
            The seller will add tracking information
            after your order ships.
          </p>
        </div>

      </div>
    `;
  }

  const trackingUrl =
    getTrackingUrl(
      order.shipping_carrier,
      order.tracking_number
    );

  return `
    <div class="buyer-tracking-box">

      <div class="buyer-tracking-info">

        <div>
          <span>Carrier</span>

          <strong>
            ${escapeHtml(
              order.shipping_carrier || "Other"
            )}
          </strong>
        </div>

        <div>
          <span>Tracking Number</span>

          <strong>
            ${escapeHtml(order.tracking_number)}
          </strong>
        </div>

      </div>

      ${
        trackingUrl
          ? `
            <a
              class="buyer-track-btn"
              href="${trackingUrl}"
              target="_blank"
              rel="noopener noreferrer"
            >
              Track Package
            </a>
          `
          : ""
      }

    </div>
  `;
}
function buyerOrderTimelineHTML(status){

  const currentStatus =
    String(status || "New").toLowerCase();

  const isShipped =
    currentStatus === "shipped" ||
    currentStatus === "delivered";

  const isDelivered =
    currentStatus === "delivered";

  return `
    <div class="buyer-order-timeline">

      <div class="timeline-step active">
        <div class="timeline-dot"></div>
        <span>Order Placed</span>
      </div>

      <div class="timeline-line ${isShipped ? "active" : ""}"></div>

      <div class="timeline-step ${isShipped ? "active" : ""}">
        <div class="timeline-dot"></div>
        <span>Shipped</span>
      </div>

      <div class="timeline-line ${isDelivered ? "active" : ""}"></div>

      <div class="timeline-step ${isDelivered ? "active" : ""}">
        <div class="timeline-dot"></div>
        <span>Delivered</span>
      </div>

    </div>
  `;
}
function renderBuyerOrders(){

  const box =
    document.getElementById("buyerOrders");

  if(!box) return;

  box.innerHTML =
    `<p class="muted">Loading your orders...</p>`;

  fetch("/api/buyer/orders", {
    credentials:"include"
  })
  .then(async res => {

    const data = await res.json();

    if(!res.ok){
      throw new Error(
        data.error || "Could not load your orders"
      );
    }

    return data;
  })
  .then(orders => {

    if(!Array.isArray(orders) || orders.length === 0){

      box.innerHTML = `
        <div class="buyer-orders-empty">
          <h3>No orders yet</h3>
          <p>
            Purchases made while logged into your
            buyer account will appear here.
          </p>
        </div>
      `;

      return;
    }

    box.innerHTML = orders.map(order => {

      const shippingCityLine = [
        order.shipping_city,
        order.shipping_state,
        order.shipping_postal_code
      ].filter(Boolean).join(", ");

      return `
        <div class="buyer-order-card">

          <div class="buyer-order-header">

            <div>
              <strong>
                Order #${order.id}
              </strong>

              <p>
                ${
                  order.created_at
                    ? new Date(order.created_at)
                        .toLocaleString()
                    : ""
                }
              </p>
            </div>

    <span class="buyer-order-status status-${String(order.status || "New").toLowerCase()}">
  ${escapeHtml(order.status || "New")}
</span>        
${buyerOrderTimelineHTML(order.status)}
          </div>

          <div class="buyer-order-items">

            ${(order.items || []).map(item => `
              <div class="buyer-order-item">

                <strong>
                  ${escapeHtml(
                    item.product_name || "Product"
                  )}
                </strong>

                <p>
                  Quantity: ${item.quantity || 1}
                </p>

                ${
                  item.selected_color
                    ? `<p>Color: ${escapeHtml(item.selected_color)}</p>`
                    : ""
                }

                ${
                  item.selected_clothing_size
                    ? `<p>Size: ${escapeHtml(item.selected_clothing_size)}</p>`
                    : ""
                }

                ${
                  item.selected_shoe_size
                    ? `<p>Shoe Size: ${escapeHtml(item.selected_shoe_size)}</p>`
                    : ""
                }

                ${
                  item.selected_waist_size
                    ? `<p>Waist Size: ${escapeHtml(item.selected_waist_size)}</p>`
                    : ""
                }

                ${
                  item.unit_price != null
                    ? `<p>Price: ${money(item.unit_price)}</p>`
                    : ""
                }

              </div>
            `).join("")}

          </div>
${buyerTrackingHTML(order)}
          ${
            order.shipping_line1 ||
            order.shipping_city
              ? `
                <div class="buyer-order-shipping">

                  <h4>
                    Shipping Address
                  </h4>

                  ${
                    order.shipping_name
                      ? `<p>${escapeHtml(order.shipping_name)}</p>`
                      : ""
                  }

                  ${
                    order.shipping_line1
                      ? `<p>${escapeHtml(order.shipping_line1)}</p>`
                      : ""
                  }

                  ${
                    order.shipping_line2
                      ? `<p>${escapeHtml(order.shipping_line2)}</p>`
                      : ""
                  }

                  ${
                    shippingCityLine
                      ? `<p>${escapeHtml(shippingCityLine)}</p>`
                      : ""
                  }

                  ${
                    order.shipping_country
                      ? `<p>${escapeHtml(order.shipping_country)}</p>`
                      : ""
                  }

                </div>
              `
              : ""
          }

          <div class="buyer-order-total">
            <span>Order Total</span>

            <strong>
              ${money(order.amount || 0)}
            </strong>
          </div>

        </div>
      `;

    }).join("");

  })
  .catch(err => {

    console.error(
      "Buyer orders error:",
      err
    );

    box.innerHTML = `
      <p class="muted">
        ${escapeHtml(err.message)}
      </p>
    `;

  });
}
function renderCart(){
  const box=document.getElementById("cartItems");

  box.innerHTML = cart.length
  ? cart.map((p,i) => `
      <div class="cart-row">

        <div class="cart-item-image">
          ${p.image
            ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}">`
            : `<div class="cart-image-placeholder">
                 <i class="fa-solid fa-bag-shopping"></i>
               </div>`
          }
        </div>

        <div class="cart-item-info">

          <div class="cart-item-category">
            ${escapeHtml(p.category || "Product")}
          </div>

          <strong class="cart-item-name">
            ${escapeHtml(p.name)}
          </strong>

          <div class="cart-option-badges">

            ${p.selectedColor
              ? `<span><b>Color</b> ${escapeHtml(p.selectedColor)}</span>`
              : ""
            }

            ${p.selectedClothingSize
              ? `<span><b>Size</b> ${escapeHtml(p.selectedClothingSize)}</span>`
              : ""
            }

            ${p.selectedShoeSize
              ? `<span><b>Shoe</b> ${escapeHtml(p.selectedShoeSize)}</span>`
              : ""
            }

            ${p.selectedWaistSize
              ? `<span><b>Waist</b> ${escapeHtml(p.selectedWaistSize)}</span>`
              : ""
            }

          </div>

          <button data-i="${i}" class="remove-cart">
            <i class="fa-regular fa-trash-can"></i>
            Remove
          </button>

        </div>

        <div class="cart-item-price">
          ${money(p.price)}
        </div>

      </div>
    `).join("")
  : `
      <div class="cart-empty">
        <i class="fa-solid fa-bag-shopping"></i>
        <h3>Your cart is empty</h3>
        <p>Add something you love from the marketplace.</p>
      </div>
    `;

  const subtotal=cart.reduce(
    (s,p)=>s+Number(p.price),
    0
  );

  const uniqueShippingProducts=new Map();

  cart.forEach(p=>{
    const key=String(p.id);

    if(!uniqueShippingProducts.has(key)){
      uniqueShippingProducts.set(
        key,
        Number(p.shipping_fee || 0)
      );
    }
  });

  const shipping=[
    ...uniqueShippingProducts.values()
  ].reduce((s,n)=>s+n,0);

  document.getElementById("subtotal").textContent=
    money(subtotal);

  document.getElementById("shipping").textContent=
    money(shipping);

  document.getElementById("total").textContent=
    money(subtotal+shipping);

  document.querySelectorAll(".remove-cart")
    .forEach(b=>b.addEventListener("click",()=>{
      cart.splice(Number(b.dataset.i),1);

      localStorage.setItem(
        "jexaliCart",
        JSON.stringify(cart)
      );

      updateCartCount();
      renderCart();
    }));
}
document.getElementById("checkoutBtn").addEventListener("click",()=>{
  if(!cart.length){alert("Your cart is empty.");return;}
fetch('/api/checkout',{
method:'POST',
headers:{ 'Content-Type' :'application/json'},
body:JSON.stringify({cart})
})
.then(res=>res.json())
.then(data=>{if(data.error) {alert(data.error);return;} window.location.href=data.url;});
});

updateCartCount();
renderShop();

const params=new URLSearchParams(window.location.search);
if(params.get("success")==="1"){
 const sessionId=params.get("session_id");
  if(sessionId){
    fetch("/api/checkout/verify?session_id="+encodeURIComponent(sessionId))
      .then(res=>res.json())
    .then(data=>{
      if(data.ok) alert("Thank you for your purchase!");
    });
  }
}
if(params.get("canceled")==="1")alert("Payment canceled.");

let stripeConnected=false;
const connectStripeBtn=document.getElementById("connectStripeBtn");
fetch("/api/me").then(r=>r.ok? r.json():null).then(data=>{if(data?.stripeConnected) {stripeConnected=true;connectStripeBtn.textContent="Stripe Connected";}});



connectStripeBtn.addEventListener("click",async()=>{
const email = prompt("ENTER your seller email:");
  if (!email) return;
  const res=await fetch("/api/connect/create-account",
{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email})});
const data=await res.json();

window.location.href=data.url;
});

const registerBtn = document.getElementById("registerBtn");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const myOrdersNav =
  document.getElementById("myOrdersNav");
logoutBtn.style.display = "none";
const accountMessage = document.getElementById("accountMessage");
if (registerBtn) {
registerBtn.addEventListener("click", async () => { 
const name = document.getElementById("registerName").value.trim();
const email = document.getElementById("registerEmail").value.trim();  
const password = document.getElementById("registerPassword").value;
const role = document.getElementById("registerRole").value;
const response = await fetch("/api/register", { 
method: "POST", 
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ name, email, password, role })
});  
const data = await response.json(); 
accountMessage.textContent = data.success ? "account created successfully" : data.error; 
});  
}  
if (loginBtn) {

  loginBtn.addEventListener("click", async () => {

    const email =
      document.getElementById("loginEmail").value.trim();

    const password =
      document.getElementById("loginPassword").value;

    const response = await fetch("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        password
      })
    });

    const data = await response.json();

    if (response.ok) {

      logoutBtn.style.display = "";

      accountMessage.textContent =
        `Logged in as ${data.user.name} (${data.user.role})`;

      if(myOrdersNav){
        myOrdersNav.style.display =
          data.user.role === "buyer"
            ? ""
            : "none";
      }

      fetch("/api/me")
        .then(r => r.json())
        .then(me => {

          stripeConnected =
            !!me.stripeConnected;

          connectStripeBtn.textContent =
            stripeConnected
              ? "Stripe Connected"
              : "Connect with Stripe";

        });

    } else {

      accountMessage.textContent =
        data.error || "Could not log in";

    }

  });

}
if (logoutBtn) {
logoutBtn.addEventListener("click", async () => {
const response = await fetch("/api/logout", { method: "POST" }); 
if (response.ok) {
accountMessage.textContent = "Logged out";
logoutBtn.style.display = "none"; 
 if(myOrdersNav){
  myOrdersNav.style.display = "none";
} 
stripeConnected=false; 
connectStripeBtn.textContent="Connect with Stripe";  
} 
else { 
accountMessage.textContent = "Could not log out";
}
});
}
fetch("/api/me")
.then(res => res.ok ? res.json() : null)
.then(data => {

  if(!data || !data.user){
    if(myOrdersNav){
      myOrdersNav.style.display = "none";
    }
    return;
  }

  logoutBtn.style.display = "";

  accountMessage.textContent =
    "Logged in as " +
    data.user.name +
    " (" +
    data.user.role +
    ")";

  if(myOrdersNav){
    myOrdersNav.style.display =
      data.user.role === "buyer"
        ? ""
        : "none";
  }

}); 
