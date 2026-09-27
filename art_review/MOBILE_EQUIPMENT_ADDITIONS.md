# Mobile และชุดสวมใส่รอบใหม่

สร้างด้วย ImageGen แบบ built-in โดยใช้ `public/assets/characters/loom.png` เป็น **อ้างอิงเฉพาะสไตล์และมุมกล้อง** ไม่ใช้รูปทรงเดิม ภาพทุกไฟล์เป็น PNG 1254×1254 พื้นหลังโปร่งใส

## แนวทางพรอมป์ตที่ใช้ร่วมกัน

> Hand-painted fantasy mechanical game illustration, crisp silhouette, rich brass details, side-facing right three-quarter orthographic view for a Mobile. One isolated asset centered in a square frame, genuine transparent alpha background, no landscape, no text, no UI. Equipment pieces are isolated interchangeable attachments with a front-facing readable shape.

## Mobile

| ไฟล์ | จุดเด่นภาพ | รูปแบบยิง |
| --- | --- | --- |
| `public/assets/characters/halo.png` | รถหอดูดาวสีครามเข้ม วงแหวนไจโรทอง ปืนปริซึมสีฟ้า | นัดแม่น ท่าพิเศษไม่ถูกลมพัด |
| `public/assets/characters/kestrel.png` | รถใบเรือปีกนกสีเขียวทะเลและงาช้าง หัวเรือเป็นปืน | กระสุนคู่ ท่าพิเศษสามกระสุน |
| `public/assets/characters/cinder.png` | รถเตาหลอมเกราะหินดำรอยลาวา ปืนรูปค้อน | ระเบิดหนักและพื้นที่กว้าง |

## ชุดสวมใส่

แต่ละชิ้นสร้างแยกจากกันด้วย ImageGen ตามพรอมป์ตร่วมด้านบน ชุดโจมตีใช้เคลือบแดงและขอบทอง, ชุดป้องกันใช้เหล็กน้ำเงินและเงิน, ชุดเลือดใช้หยกเขียวและงาช้าง

| ชุด | หมวกบนหลังคา (`hat`) | เกราะตัวรถ (`armor`) | ธงท้ายรถ (`flag`) |
| --- | --- | --- | --- |
| โจมตี | ป้อมปืนยอดหลังคาและธงแดง | แผ่นเกราะลายเปลวไฟ | ธงแดงทองลายเปลวไฟ |
| ป้องกัน | หมวกโดมตราโล่ | แผ่นเกราะชั้นหนา | ธงน้ำเงินเงินตราโล่ |
| เลือด | หมวกยอดใบไม้ | แผ่นเกราะลายพฤกษาพร้อมผลึก | ธงเขียวหยกลายใบไม้ |

ไฟล์อยู่ใน `public/assets/equipment/<ชุด>-<ชิ้น>.png` เช่น `attack-hat.png` และ `health-flag.png` ทั้งเก้าภาพมีพื้นหลังโปร่งใสจริงและขนาดเท่ากัน
