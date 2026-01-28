import React from 'react';
import { motion } from 'framer-motion';
import { Coffee, Pizza, Sandwich, GlassWater, IceCream, UtensilsCrossed } from 'lucide-react';

const iconMap = {
  coffee: Coffee,
  pizza: Pizza,
  sandwich: Sandwich,
  drink: GlassWater,
  dessert: IceCream,
  default: UtensilsCrossed
};

export default function CategoryTabs({ categories, activeCategory, onSelect }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => onSelect(null)}
        className={`flex items-center gap-2 px-5 py-3 rounded-xl font-semibold transition-all whitespace-nowrap ${activeCategory === null
            ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-xl shadow-blue-500/40 scale-105'
            : 'bg-white/90 text-gray-600 hover:bg-white hover:shadow-lg border border-gray-200'
          }`}
      >
        <UtensilsCrossed className="w-4 h-4" />
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
            className={`flex items-center gap-2 px-5 py-3 rounded-xl font-semibold transition-all whitespace-nowrap ${activeCategory === category.id
                ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-xl shadow-blue-500/40 scale-105'
                : 'bg-white/90 text-gray-600 hover:bg-white hover:shadow-lg border border-gray-200'
              }`}
          >
            <Icon className="w-4 h-4" />
            {category.name}
          </motion.button>
        );
      })}
    </div>
  );
}