// Tecpancito POS — sample data
// Menú típico chapín + bebidas (basado en las capturas reales)

window.TECPAN_CATEGORIES = [
  { id: "todas", name: "Todas", emoji: null },
  { id: "alimentos", name: "Alimentos" },
  { id: "alitas", name: "Alitas" },
  { id: "antojitos", name: "Antojitos" },
  { id: "tortillas", name: "Tortillas" },
  { id: "papas", name: "Papas Fritas" },
  { id: "emparedados", name: "Emparedados" },
  { id: "poppers", name: "Poppers" },
  { id: "promos", name: "Promociones" },
  { id: "cerveza-art", name: "Cervezas Artesanales" },
  { id: "cerveza-com", name: "Cervezas Comerciales" },
  { id: "licores", name: "Licores" },
  { id: "preparadas", name: "Preparadas" },
  { id: "bebidas", name: "Bebidas" },
  { id: "gaseosas", name: "Gaseosas" },
  { id: "caliente", name: "Bebida Caliente" },
  { id: "licuados", name: "Licuados" },
  { id: "postres", name: "Postres" },
  { id: "aderezos", name: "Aderezos" },
  { id: "cigarros", name: "Cigarros" },
];

window.TECPAN_PRODUCTS = [
  // Alitas (24 productos como en el real)
  { id: "ali-aj16", name: "Alitas Ajo Parmesano", size: "16u", price: 98, cat: "alitas", stock: 29 },
  { id: "ali-bb16", name: "Alitas Barbacoa", size: "16u", price: 98, cat: "alitas", stock: 30 },
  { id: "ali-bp16", name: "Alitas Barbacoa Picante", size: "16u", price: 98, cat: "alitas", stock: 30 },
  { id: "ali-bu16", name: "Alitas Búfalo", size: "16u", price: 98, cat: "alitas", stock: 30 },
  { id: "ali-cl16", name: "Alitas Chiltepe Limón", size: "16u", price: 98, cat: "alitas", stock: 28 },
  { id: "ali-ch16", name: "Alitas Chipotle", size: "16u", price: 98, cat: "alitas", stock: 30 },
  { id: "ali-cr16", name: "Alitas Crispy", size: "16u", price: 100, cat: "alitas", stock: 29 },
  { id: "ali-en16", name: "Alitas Endiabladas", size: "16u", price: 98, cat: "alitas", stock: 22 },
  { id: "ali-fh16", name: "Alitas From Hell", size: "16u", price: 98, cat: "alitas", stock: 18 },
  { id: "ali-lp16", name: "Alitas Lemon Pepper", size: "16u", price: 98, cat: "alitas", stock: 30 },
  { id: "ali-mm16", name: "Alitas Mostaza Miel", size: "16u", price: 98, cat: "alitas", stock: 30 },
  { id: "ali-nt16", name: "Alitas Neutro", size: "16u", price: 98, cat: "alitas", stock: 30 },
  { id: "ali-aj8",  name: "Alitas Ajo Parmesano", size: "8u",  price: 55, cat: "alitas", stock: 30 },
  { id: "ali-bb8",  name: "Alitas Barbacoa", size: "8u",  price: 55, cat: "alitas", stock: 29 },
  { id: "ali-bp8",  name: "Alitas Barbacoa Picante", size: "8u",  price: 55, cat: "alitas", stock: 30 },
  { id: "ali-bu8",  name: "Alitas Búfalo", size: "8u",  price: 55, cat: "alitas", stock: 30 },
  { id: "ali-cl8",  name: "Alitas Chiltepe Limón", size: "8u",  price: 55, cat: "alitas", stock: 30 },
  { id: "ali-ch8",  name: "Alitas Chipotle", size: "8u",  price: 55, cat: "alitas", stock: 30 },
  { id: "ali-cr8",  name: "Alitas Crispy", size: "8u",  price: 60, cat: "alitas", stock: 29 },
  { id: "ali-en8",  name: "Alitas Endiabladas", size: "8u",  price: 55, cat: "alitas", stock: 30 },
  { id: "ali-fh8",  name: "Alitas From Hell", size: "8u",  price: 55, cat: "alitas", stock: 26 },
  { id: "ali-lp8",  name: "Alitas Lemon Pepper", size: "8u",  price: 55, cat: "alitas", stock: 30 },
  { id: "ali-mm8",  name: "Alitas Mostaza Miel", size: "8u",  price: 55, cat: "alitas", stock: 30 },
  { id: "ali-nt8",  name: "Alitas Neutro", size: "8u",  price: 55, cat: "alitas", stock: 30 },

  // Antojitos / Alimentos chapines
  { id: "ant-taq",  name: "Taquitos de pollo", size: null, price: 30, cat: "antojitos", stock: 25, hot: true },
  { id: "ant-tos",  name: "Tostadas chapinas", size: "3u", price: 28, cat: "antojitos", stock: 30 },
  { id: "ant-chu",  name: "Chuchitos", size: "2u", price: 32, cat: "antojitos", stock: 20 },
  { id: "ant-tam",  name: "Tamalitos de chipilín", size: "2u", price: 28, cat: "antojitos", stock: 18 },
  { id: "ant-rel",  name: "Rellenitos de plátano", size: "3u", price: 35, cat: "antojitos", stock: 22 },
  { id: "ant-pup",  name: "Pupusas revueltas", size: "2u", price: 30, cat: "antojitos", stock: 14 },

  // Tortillas (combos típicos)
  { id: "tor-cho",  name: "Tortillas con chorizo asado", size: null, price: 35, cat: "tortillas", stock: 30 },
  { id: "tor-chi",  name: "Tortillas con chicharrón y longaniza", size: null, price: 38, cat: "tortillas", stock: 28 },
  { id: "tor-que",  name: "Tortillas con queso fresco", size: null, price: 28, cat: "tortillas", stock: 30 },
  { id: "tor-fri",  name: "Tortillas con frijoles", size: null, price: 25, cat: "tortillas", stock: 30 },
  { id: "tor-hue",  name: "Tortillas con huevos rancheros", size: null, price: 32, cat: "tortillas", stock: 26 },

  // Papas Fritas
  { id: "pap-pic",  name: "Papas Fritas Picantes", size: null, price: 35, cat: "papas", stock: 30 },
  { id: "pap-que",  name: "Papas Fritas con Queso", size: null, price: 45, cat: "papas", stock: 30 },
  { id: "pap-tos",  name: "Papas Fritas de Tocineta", size: null, price: 48, cat: "papas", stock: 28 },
  { id: "pap-ajp",  name: "Papas Fritas Ajo Parmesano", size: null, price: 45, cat: "papas", stock: 30 },
  { id: "pap-mix",  name: "Papas Crema y Tocineta", size: null, price: 58, cat: "papas", stock: 24 },
  { id: "pap-bbq",  name: "Papas Fritas Barbacoa Ranch", size: null, price: 55, cat: "papas", stock: 26 },

  // Emparedados / 1/4 libra
  { id: "emp-cla",  name: "1/4 lb Clásica", size: null, price: 78, cat: "emparedados", stock: 18, hot: true },
  { id: "emp-toc",  name: "1/4 lb Tocineta", size: null, price: 88, cat: "emparedados", stock: 14 },
  { id: "emp-blu",  name: "Premium 1/4 lb BlueCheese", size: null, price: 110, cat: "emparedados", stock: 10 },
  { id: "emp-hug",  name: "Hugger Texas", size: null, price: 95, cat: "emparedados", stock: 12 },

  // Poppers
  { id: "pop-cla",  name: "Poppers Clásicos", size: "6u", price: 55, cat: "poppers", stock: 22 },
  { id: "pop-toc",  name: "Poppers Tocineta", size: "6u", price: 65, cat: "poppers", stock: 18 },
  { id: "pop-jal",  name: "Poppers Jalapeño", size: "6u", price: 60, cat: "poppers", stock: 20 },

  // Cervezas artesanales
  { id: "cer-dgi",  name: "Dead Guy Imperial IPA", size: null, price: 40, cat: "cerveza-art", stock: 24, hot: true },
  { id: "cer-cas",  name: "Cabro Stout", size: null, price: 35, cat: "cerveza-art", stock: 20 },
  { id: "cer-mom",  name: "Moza Roja", size: null, price: 30, cat: "cerveza-art", stock: 28 },
  { id: "cer-cax",  name: "Cabro Extra", size: null, price: 32, cat: "cerveza-art", stock: 22 },

  // Cervezas comerciales / barril
  { id: "cer-bcl",  name: "Cerveza de Barril Clara", size: "litro", price: 40, cat: "cerveza-com", stock: 49 },
  { id: "cer-bos",  name: "Cerveza de Barril Oscura", size: "litro", price: 40, cat: "cerveza-com", stock: 49 },
  { id: "cer-gal",  name: "Gallo Lata", size: null, price: 22, cat: "cerveza-com", stock: 60 },
  { id: "cer-mod",  name: "Modelo Especial", size: null, price: 28, cat: "cerveza-com", stock: 40 },

  // Licores / preparadas
  { id: "lic-jcb",  name: "Tablazo José Cuervo", size: null, price: 80, cat: "licores", stock: 12 },
  { id: "lic-jw",   name: "JW Etiqueta Negra", size: "shot", price: 65, cat: "licores", stock: 18 },
  { id: "lic-rn",   name: "Ron Zacapa 23", size: "shot", price: 90, cat: "licores", stock: 14 },
  { id: "pre-mar",  name: "Margarita de la casa", size: null, price: 55, cat: "preparadas", stock: 20 },
  { id: "pre-mic",  name: "Michelada Chapina", size: null, price: 38, cat: "preparadas", stock: 25 },

  // Bebida caliente (Tecpán style)
  { id: "cal-cao",  name: "Café de olla", size: null, price: 18, cat: "caliente", stock: 30 },
  { id: "cal-cho",  name: "Chocolate caliente", size: null, price: 22, cat: "caliente", stock: 28 },
  { id: "cal-ato",  name: "Atol de elote", size: null, price: 20, cat: "caliente", stock: 24 },

  // Bebidas / gaseosas
  { id: "gas-coc",  name: "Coca-Cola", size: "500ml", price: 15, cat: "gaseosas", stock: 60 },
  { id: "gas-pep",  name: "Pepsi", size: "500ml", price: 15, cat: "gaseosas", stock: 45 },
  { id: "gas-sal",  name: "Salutaris agua", size: "600ml", price: 12, cat: "gaseosas", stock: 80 },

  // Licuados
  { id: "lic-fre",  name: "Licuado de fresa", size: null, price: 25, cat: "licuados", stock: 20 },
  { id: "lic-ban",  name: "Licuado de banano leche", size: null, price: 22, cat: "licuados", stock: 22 },

  // Postres
  { id: "pos-fla",  name: "Flan napolitano", size: null, price: 28, cat: "postres", stock: 12 },
  { id: "pos-tre",  name: "Tres leches", size: null, price: 32, cat: "postres", stock: 10 },

  // Promos
  { id: "pro-com1", name: "Combo Pareja (8u + 2 cerv)", size: null, price: 95, cat: "promos", stock: 999, hot: true },
  { id: "pro-com2", name: "Combo Familiar (16u + papas)", size: null, price: 145, cat: "promos", stock: 999 },
];

// Tag products with cat=alimentos as ones that show in Alimentos super-category
window.TECPAN_PRODUCTS.forEach(p => {
  if (["antojitos","tortillas","papas","emparedados","poppers","alitas"].includes(p.cat)) {
    p.parentCat = "alimentos";
  }
  if (["cerveza-art","cerveza-com","licores","preparadas"].includes(p.cat)) {
    p.parentCat = "bebidas-alc";
  }
  if (["bebidas","gaseosas","caliente","licuados"].includes(p.cat)) {
    p.parentCat = "bebidas";
  }
});

// Sample orders for the Órdenes screen (with states)
window.TECPAN_ORDERS_SEED = [
  {
    id: "o-1",
    label: "Mesa 2",
    createdAt: "3:36 p.m.",
    items: [
      { id: "ali-bu8", name: "Alitas Búfalo 8u", qty: 1, price: 55 },
    ],
    status: "kitchen",      // kitchen | bar | ready | served | paid
    sentTo: ["cocina"],
    open: true,
  },
  {
    id: "o-2",
    label: "Mesa 5",
    createdAt: "3:48 p.m.",
    items: [
      { id: "ali-cr16", name: "Alitas Crispy 16u", qty: 1, price: 100 },
      { id: "pap-mix", name: "Papas Crema y Tocineta", qty: 1, price: 58 },
      { id: "cer-bcl", name: "Barril Clara litro", qty: 2, price: 40 },
    ],
    status: "ready",
    sentTo: ["cocina","barra"],
    open: true,
  },
  {
    id: "o-3",
    label: "Orden 3",
    createdAt: "1:03 p.m.",
    items: [
      { id: "lic-jcb", name: "Tablazo José Cuervo", qty: 1, price: 80 },
    ],
    status: "served",
    sentTo: ["barra"],
    open: true,
  },
  {
    id: "o-4",
    label: "Mesa 1",
    createdAt: "12:55 p.m.",
    items: [
      { id: "ant-taq", name: "Taquitos de pollo", qty: 2, price: 30 },
      { id: "tor-cho", name: "Tortillas con chorizo", qty: 1, price: 35 },
    ],
    status: "served",
    sentTo: ["cocina"],
    open: true,
  },
  {
    id: "o-5",
    label: "Mesa 8",
    createdAt: "12:55 p.m.",
    items: [
      { id: "ali-ch16", name: "Alitas Chipotle 16u", qty: 1, price: 98 },
      { id: "ali-mm16", name: "Alitas Mostaza Miel 16u", qty: 1, price: 98 },
      { id: "pap-bbq", name: "Papas Fritas BBQ Ranch", qty: 1, price: 55 },
      { id: "cer-gal", name: "Gallo Lata", qty: 4, price: 22 },
    ],
    status: "kitchen",
    sentTo: ["cocina","barra"],
    open: true,
  },
  // cobradas
  { id: "o-p1", label: "#7", createdAt: "3:02 p.m.", items: [{name:"Tablazo José Cuervo", qty:1, price:80}], status: "paid", open: false, total: 80 },
  { id: "o-p2", label: "#6", createdAt: "2:35 p.m.", items: [{name:"Alitas From Hell 16u", qty:1, price:98},{name:"Cerveza Gallo", qty:5, price:22},{name:"Papas Picantes", qty:1, price:35}], status: "paid", open: false, total: 225 },
  { id: "o-p3", label: "#5", createdAt: "2:15 p.m.", items: [{name:"Tablazo", qty:1, price:80}], status: "paid", open: false, total: 80 },
  { id: "o-p4", label: "Mesa 2", createdAt: "11:48 a.m.", items: [{name:"Combo Familiar", qty:2, price:145},{name:"Cerveza barril clara", qty:5, price:40},{name:"Papas mix", qty:3, price:58},{name:"Atol elote", qty:2, price:20}], status: "paid", open: false, total: 716 },
  { id: "o-p5", label: "Mesa 5", createdAt: "10:26 a.m.", items: [{name:"Varios", qty:6, price:84}], status: "paid", open: false, total: 504 },
  { id: "o-p6", label: "#4", createdAt: "10:02 a.m.", items: [{name:"Chuchitos x4", qty:4, price:32}], status: "paid", open: false, total: 128 },
  { id: "o-p7", label: "#3", createdAt: "9:48 a.m.", items: [{name:"Desayuno chapín", qty:3, price:45}], status: "paid", open: false, total: 135 },
];

// Status meta
window.TECPAN_STATUS = {
  kitchen:  { label: "En cocina",   color: "warn", icon: "flame" },
  bar:      { label: "En barra",    color: "accent", icon: "glass" },
  ready:    { label: "Lista",       color: "ok",   icon: "bell" },
  served:   { label: "Entregada",   color: "muted",   icon: "check" },
  paid:     { label: "Pagada",      color: "ok",   icon: "money" },
};
