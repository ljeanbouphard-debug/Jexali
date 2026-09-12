const seedProducts=[
{id:"seed1",name:"Wireless Headphones",price:39.99,category:"Electronics",desc:"Comfortable everyday wireless headphones.",image:""},
{id:"seed2",name:"Classic Sneakers",price:54.99,category:"Fashion",desc:"Clean everyday sneakers.",image:""},
{id:"seed3",name:"Travel Backpack",price:44.50,category:"Fashion",desc:"Simple backpack for daily use.",image:""}
];

let customProducts=JSON.parse(localStorage.getItem("jexaliProducts")||"[]");
let cart=JSON.parse(localStorage.getItem("jexaliCart")||"[]");
let sales=Number(localStorage.getItem("jexaliSales")||0);
let sellerRevenue=Number(localStorage.getItem("jexaliSellerRevenue")||0);
let jexaliRevenue=Number(localStorage.getItem("jexaliRevenue")||0);

const allProducts=()=>[...seedProducts,...customProducts];
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
    ${p.image?`<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}">`:`<div class="placeholder">🛍️</div>`}
    <div class="card-body">
      <div class="category">${escapeHtml(p.category)}</div>
      <h3>${escapeHtml(p.name)}</h3>
      <p>${escapeHtml(p.desc)}</p>
      <div class="price">${money(p.price)}</div>
      ${seller?`<button class="secondary remove-product" data-id="${p.id}">Remove listing</button>`:`<button class="primary add-cart" data-id="${p.id}">Add to Cart</button>`}
    </div>
  </article>`;
}
function escapeHtml(s){return String(s||"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}

function renderShop(){
  const q=document.getElementById("searchInput").value.toLowerCase().trim();
  const items=allProducts().filter(p=>(p.name+" "+p.category+" "+p.desc).toLowerCase().includes(q));
  document.getElementById("productGrid").innerHTML=items.length?items.map(p=>cardHTML(p)).join(""):"<p>No products found.</p>";
  document.querySelectorAll(".add-cart").forEach(b=>b.addEventListener("click",()=>addToCart(b.dataset.id)));
}
document.getElementById("searchInput").addEventListener("input",renderShop);

function addToCart(id){
  const p=allProducts().find(x=>x.id===id);
  if(!p) return;
  cart.push({...p,cartId:Date.now()+Math.random()});
  localStorage.setItem("jexaliCart",JSON.stringify(cart));
  updateCartCount();
}

function updateCartCount(){document.getElementById("cartCount").textContent=cart.length;}

document.getElementById("productForm").addEventListener("submit",e=>{
  e.preventDefault();
  const name=document.getElementById("pName").value.trim();
  const price=Number(document.getElementById("pPrice").value);
  const category=document.getElementById("pCategory").value;
  const image=document.getElementById("pImage").value.trim();
  const desc=document.getElementById("pDesc").value.trim();
  if(!name || !desc || !(price>0)){document.getElementById("formMsg").textContent="Please complete all required fields.";return;}
  const sellerStripeId=localStorage.getItem("jexaliStripeAccountId");
  const p={id:"p"+Date.now(),name,price,category,image,desc,seller:sellerStripeId};
  customProducts.unshift(p);
  localStorage.setItem("jexaliProducts",JSON.stringify(customProducts));
  e.target.reset();
  document.getElementById("formMsg").textContent="Product published successfully.";
  setTimeout(()=>go("dashboard"),500);
});

function renderDashboard(){
  document.getElementById("listingCount").textContent=customProducts.length;
  document.getElementById("salesCount").textContent=sales;
  document.getElementById("earnings").textContent=money(sellerRevenue);
  document.getElementById("jexaliFees").textContent=money(jexaliRevenue);
  document.getElementById("sellerListings").innerHTML=customProducts.length?customProducts.map(p=>cardHTML(p,true)).join(""):"<p>You have not posted any products yet.</p>";
  document.querySelectorAll(".remove-product").forEach(b=>b.addEventListener("click",()=>{
    customProducts=customProducts.filter(p=>p.id!==b.dataset.id);
    localStorage.setItem("jexaliProducts",JSON.stringify(customProducts));
    renderDashboard();
  }));
}

function renderCart(){
  const box=document.getElementById("cartItems");
  box.innerHTML=cart.length?cart.map((p,i)=>`<div class="cart-row"><div><strong>${escapeHtml(p.name)}</strong><div class="muted">${money(p.price)}</div></div><button data-i="${i}" class="remove-cart">Remove</button></div>`).join(""):"<p>Your cart is empty.</p>";
  const subtotal=cart.reduce((s,p)=>s+Number(p.price),0);
  const fee=subtotal*.10;
  document.getElementById("subtotal").textContent=money(subtotal);
  document.getElementById("fee").textContent=money(fee);
  document.getElementById("total").textContent=money(subtotal);
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
.then(data=>window.location.href=data.url);
});

updateCartCount();
renderShop();

const params=new URLSearchParams(window.location.search);
if(params.get("success")==="1")alert("Thank you for your purchase!");
if(params.get("canceled")==="1")alert("Payment canceled.");
const savedStripeId=localStorage.getItem("jexaliStripeAccountId");

const connectStripeBtn=document.getElementById("connectStripeBtn");
if(savedStripeId) connectStripeBtn.textContent="Stripe Connected";

connectStripeBtn.addEventListener("click",async()=>{
const res=await fetch("/api/connect/create-account",
{method:"POST"});
const data=await res.json();
localStorage.setItem("jexaliStripeAccountId",data.accountId);
window.location.href=data.url;
});
