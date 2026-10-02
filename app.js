

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
});
  
const money=n=>"$"+Number(n).toFixed(2);

function go(view){
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  document.getElementById(view).classList.add("active");
  window.scrollTo({top:0,behavior:"smooth"});
  if(view==="shop") renderShop();
  if(view==="dashboard") renderDashboard();
  if(view==="cart") renderCart();
}
document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.view)));

function cardHTML(p, seller=false){
  return `<article class="card">
    ${p.image?`<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" class="product-image-clickable">`:`<div class="placeholder">🛍️</div>`}
    <div class="card-body">
      <div class="category">${escapeHtml(p.category)}</div>
      <h3>${escapeHtml(p.name)}</h3>
      <p>${escapeHtml(p.desc)}</p>
      <div class="price">${money(p.price)}</div>
     ${seller ? `<button class="secondary remove-product" data-id="${p.id}">Remove listing</button>` : Number(p.stock) <= 0 ? `<button class="primary" disabled>Out of Stock</button>` : `<button class="primary add-cart" data-id="${p.id}">Add to Cart</button>`} 
    </div>
  </article>`;
}
function escapeHtml(s){return String(s||"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
document.addEventListener("click", e => {
  if (e.target.classList.contains("product-image-clickable")) {
    window.open(e.target.src,"_blank"); } });
function renderShop(){
  const q=document.getElementById("searchInput").value.toLowerCase().trim();
  const items=allProducts().filter(p=>(p.name+" "+p.category+" "+p.desc).toLowerCase().includes(q));
  document.getElementById("productGrid").innerHTML=items.length?items.map(p=>cardHTML(p)).join(""):"<p>No products found.</p>";
  document.querySelectorAll(".add-cart").forEach(b=>b.addEventListener("click",()=>addToCart(b.dataset.id)));
}
document.getElementById("searchInput").addEventListener("input",renderShop);

function addToCart(id){
  const p=allProducts().find(x=>String(x.id)===String(id));
  if(!p) return;
  cart.push({...p,cartId:Date.now()+Math.random()});
  localStorage.setItem("jexaliCart",JSON.stringify(cart));
  updateCartCount();
}

function updateCartCount(){document.getElementById("cartCount").textContent=cart.length;}

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
  
  const p={id:"p"+Date.now(),name,price,stock,shipping_fee:shippingFee,category,image,desc,};
  const response=await fetch("/api/products",{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    
      body:JSON.stringify({
        name:name,
          price:price,
        
        stock:stock,
        shipping_fee: shippingFee,
        category: category,
        image: image,
        description: desc
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
   }); 


  
  
  
  
  


 
}

function renderCart(){
  const box=document.getElementById("cartItems");
  box.innerHTML=cart.length?cart.map((p,i)=>`<div class="cart-row"><div><strong>${escapeHtml(p.name)}</strong><div class="muted">${money(p.price)}</div></div><button data-i="${i}" class="remove-cart">Remove</button></div>`).join(""):"<p>Your cart is empty.</p>";
  
  const
  subtotal=cart.reduce((s,p)=>s+Number(
   p.price),0);
  const uniqueShippingProducts = new
   Map();
  cart.forEach(p=>{
   const key=String(p.id);
    if(!uniqueShippingProducts.has(key)){
     uniqueShippingProducts.set(
       key,
       Number(p.shipping_fee || 0)
       );
    }
  });
  const
    shipping=[...uniqueShippingProducts.values()]
  .reduce((s,n)=>s+n,0);
  document.getElementById("subtotal").textContent=money(subtotal);
  document.getElementById("shipping").textContent=money(shipping);
  document.getElementById("total").textContent=money(subtotal+shipping);
  document.querySelectorAll(".remove-cart").forEach(b=>b.addEventListener("click",()=>{
    cart.splice(Number(b.dataset.i),1);
    localStorage.setItem("jexaliCart",JSON.stringify(cart));
    updateCartCount(); renderCart();
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
loginBtn.addEventListener("click" , async () => { 
const email = document.getElementById("loginEmail").value.trim();
const password = document.getElementById("loginPassword").value;
const response = await fetch("/api/login", { 
method: "POST", 
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ email, password }) 
}); 
const data = await response.json();
if (response.ok) { 
logoutBtn.style.display = "";  
accountMessage.textContent = `Logged in as ${data.user.name} (${data.user.role})`;
fetch("/api/me").then(r=>r.json()).then(me=>{stripeConnected=!! me.stripeConnected;connectStripeBtn.textContent=stripeConnected?"Stripe Connected":"Connect with Stripe";});  
} else { 
accountMessage.textContent = data.error || "Could not log in";
} 
});
}
if (logoutBtn) {
logoutBtn.addEventListener("click", async () => {
const response = await fetch("/api/logout", { method: "POST" }); 
if (response.ok) {
accountMessage.textContent = "Logged out";
logoutBtn.style.display = "none"; 
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
if (!data || !data.user) return;
logoutBtn.style.display = "";  
accountMessage.textContent = "Logged in as " + data.user.name + " (" + data.user.role + ")"; 
});  
