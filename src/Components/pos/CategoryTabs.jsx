import React from 'react';
import { motion } from 'framer-motion';
import { GlassWater, Utensils, ShoppingBasket, Store, Tag, Shirt, Pill, Wrench, Bike, Smartphone, LayoutGrid } from 'lucide-react';

const iconMap = {
  default: LayoutGrid,
  basket: ShoppingBasket,
  store: Store,
  tag: Tag,
  shirt: Shirt,
  pill: Pill,
  wrench: Wrench,
  bike: Bike,
  phone: Smartphone,
  utensils: Utensils,
  drink: GlassWater,
};

export default function CategoryTabs({ categories, activeCategory, onSelect }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => onSelect(null)}
        className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all whitespace-nowrap border-2 ${activeCategory === null
          ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/20'
          : 'bg-white border-gray-100 text-gray-600 hover:border-blue-100 hover:bg-blue-50/30'
          }`}
      >
        <LayoutGrid className="w-3.5 h-3.5" />
        Tout
      </motion.button>

      {categories.map((category) => {
        const Icon = iconMap[category.icon] || iconMap.default;
        return (
          <motion.button
            key={category.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelect(category.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-xs transition-all whitespace-nowrap border-2 ${activeCategory === category.id
              ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/20'
              : 'bg-white border-gray-100 text-gray-600 hover:border-blue-100 hover:bg-blue-50/30'
              }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {category.name}
          </motion.button>
        );
      })}
    </div>
  );
}