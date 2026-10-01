const mobiles = [
  { id: 'loom', name: 'Loom', hp: 100, defense: 1, damage: 33, radius: 58, crater: 25, special: 48, specialRadius: 38, specialCrater: 16, accent: '#ff8b70', badge: 'PRECISION', tags: [], description: 'กระสุนสายด้ายที่ไว้ใจได้ เหมาะกับคนชอบยิงแม่น', ability: 'ท่าพิเศษแรงขึ้น แต่ระเบิดวงแคบลง' },
  { id: 'manta', name: 'Manta', hp: 100, defense: 1, damage: 21, count: 2, radius: 42, crater: 16, special: 19, specialCount: 3, specialRadius: 37, specialCrater: 14, accent: '#78e0d1', badge: 'SPLIT SHOT', tags: [], description: 'กระสุนแตะพื้นแล้วแยกเป็นลูกย่อย กระจายแรงกดดัน', ability: 'แตกเป็น 3 ลูกหลังชนพื้น แทน 2 ลูก' },
  { id: 'borer', name: 'Borer', hp: 100, defense: 2, damage: 34, radius: 68, crater: 40, special: 44, specialRadius: 88, specialCrater: 54, accent: '#ffd275', badge: 'TERRAIN BREAKER', tags: ['terrain'], description: 'หัวสว่านเจาะเกาะ เหมาะกับการทำลายพื้นที่ยืน', ability: 'ระเบิดกว้างขึ้นและขุดลึกขึ้น' },
  { id: 'vesper', name: 'Vesper', hp: 100, defense: 1, damage: 30, radius: 49, crater: 19, special: 45, specialRadius: 42, specialCrater: 12, accent: '#c5a6ff', badge: 'WIND RESIST', tags: [], description: 'กระสุนพลังงานที่รับแรงลมปกติเพียง 45%', ability: 'กระสุนพิเศษไม่ถูกลมปกติพัด' },
  { id: 'bramble', name: 'Bramble', hp: 100, defense: 2, damage: 27, radius: 55, crater: 18, special: 32, specialRadius: 58, specialCrater: 12, accent: '#a8e7a0', badge: 'RECOVERY', tags: [], description: 'กระสุนเมล็ดพืชที่ช่วยประคองตัวในศึกยาว', ability: 'ยิงพร้อมฟื้น HP ให้ตัวเอง 22 หากยังรอด' },
  { id: 'halo', name: 'Halo', hp: 100, defense: 2, damage: 31, radius: 50, crater: 18, special: 43, specialRadius: 44, specialCrater: 16, accent: '#8eeeff', badge: 'WIND RESIST', tags: [], description: 'พลังงานสว่างที่คุมวิถีง่ายเมื่อเจอลมแรง', ability: 'กระสุนพิเศษไม่ถูกลมปกติพัด' },
  { id: 'kestrel', name: 'Kestrel', hp: 100, defense: 1, damage: 20, count: 2, radius: 40, crater: 16, special: 19, specialCount: 3, specialRadius: 39, specialCrater: 15, accent: '#80dfc0', badge: 'SPLIT SHOT', tags: [], description: 'กระสุนแตกตัวหลังโดนพื้น เหมาะกับการยิงกวาด', ability: 'แตกเป็น 3 ลูกหลังชนพื้น แทน 2 ลูก' },
  { id: 'cinder', name: 'Cinder', hp: 100, defense: 1, damage: 39, radius: 72, crater: 42, special: 50, specialRadius: 82, specialCrater: 52, accent: '#ff956c', badge: 'TERRAIN BREAKER', tags: ['terrain'], description: 'ยิงหนัก ระเบิดกว้าง และเปิดหลุมลึก', ability: 'เพิ่มแรงระเบิดและขุดพื้นลึกขึ้น' },
  { id: 'aegis', name: 'Aegis', hp: 150, defense: 1, damage: 31, radius: 59, crater: 24, special: 42, specialRadius: 66, specialCrater: 28, accent: '#f8d88c', badge: 'RARE · 5%', tags: ['rare'], description: 'Mobile หายากจากช่องสุ่ม มี HP พื้นฐานมากกว่าคันอื่น', ability: 'กระสุนพิเศษแรงขึ้นและระเบิดกว้างขึ้น' },
  { id: 'gale', name: 'Gale', hp: 100, defense: 1, damage: 28, radius: 56, crater: 20, special: 40, specialRadius: 65, specialCrater: 27, accent: '#9ef6d4', badge: 'WIND BONUS', tags: ['wind'], description: 'เมื่อลมแรงตั้งแต่ 7 ได้ดาเมจเพิ่ม 12', ability: 'ยิงแรงและกว้างขึ้น ได้โบนัสลมเช่นเดิม' },
  { id: 'tempest', name: 'Tempest', hp: 100, defense: 1, damage: 30, radius: 48, crater: 24, special: 43, specialRadius: 53, specialCrater: 31, accent: '#cca6ff', badge: 'WIND BONUS', tags: ['wind'], description: 'ใช้ลมแรงตั้งแต่ 7 เพิ่มดาเมจอีก 12', ability: 'ยิงแรงและขุดลึกขึ้น ได้โบนัสลมเช่นเดิม' },
];

const grid = document.querySelector('#mobile-grid');
const count = document.querySelector('#result-count');
const sort = document.querySelector('#mobile-sort');
const filters = [...document.querySelectorAll('.filter')];
let activeFilter = 'all';

function damageLabel(value, count) { return count ? `${value}<small> × ${count}</small>` : String(value); }

function render() {
  const filtered = mobiles.filter(mobile => activeFilter === 'all' || mobile.tags.includes(activeFilter));
  const sorted = [...filtered];
  if (sort.value === 'damage') sorted.sort((a, b) => b.damage - a.damage);
  if (sort.value === 'special') sorted.sort((a, b) => b.special - a.special);
  if (sort.value === 'hp') sorted.sort((a, b) => b.hp - a.hp);
  grid.innerHTML = sorted.map(mobile => `
    <article class="mobile-card" style="--accent:${mobile.accent}">
      <div class="card-art"><span class="card-badge">${mobile.badge}</span><img src="/assets/characters/${mobile.id}.png" alt="Mobile ${mobile.name}" loading="lazy" /></div>
      <div class="card-content"><div class="card-name"><h3>${mobile.name}</h3><span>${mobile.hp === 150 ? 'RARE' : 'MOBILE'}</span></div>
        <p class="card-description">${mobile.description}</p>
        <dl class="stats"><div class="stat"><dt>HP</dt><dd>${mobile.hp}</dd></div><div class="stat"><dt>DEF</dt><dd>${mobile.defense}</dd></div><div class="stat"><dt>DMG</dt><dd>${damageLabel(mobile.damage, mobile.count)}</dd></div><div class="stat stat--highlight"><dt>SKILL</dt><dd>${damageLabel(mobile.special, mobile.specialCount)}</dd></div></dl>
        <div class="special-line"><b>ท่าพิเศษ</b><span>${mobile.ability}</span></div>
        <p class="spec-details">รัศมี ${mobile.radius} → ${mobile.specialRadius} <span>·</span> ขุดพื้น ${mobile.crater} → ${mobile.specialCrater}</p>
      </div>
    </article>`).join('');
  count.textContent = `แสดง ${sorted.length} จาก ${mobiles.length} คัน`;
}

for (const button of filters) button.addEventListener('click', () => {
  activeFilter = button.dataset.filter;
  for (const candidate of filters) {
    const selected = candidate === button;
    candidate.classList.toggle('is-active', selected);
    candidate.setAttribute('aria-pressed', String(selected));
  }
  render();
});
sort.addEventListener('change', render);
render();
