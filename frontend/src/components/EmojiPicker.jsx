import React from 'react';

const EMOJIS = [
  '😀','😂','😍','😎','😭','😡','👍','🙏','🎉','🔥','🥰','😱','😅','🤔','😏','😇','😜','😢','😤','😬','😴','🤩','😋','😆','😳','😑','😒','😔','😌','😃','😄','😁','😚','😙','😗','😐','😶','🙄','😕','😟','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😓','🤗','🤭','🤫','🤥','😶‍🌫️','😵','🥴','😵‍💫','🤤','😪','😷','🤒','🤕','🤑','🤠','😈','👿','👹','👺','💀','👻','👽','🤖','💩','😺','😸','😹','😻','😼','😽','🙀','😿','😾'
];

export default function EmojiPicker({ onSelect, onClose }) {
  return (
    <div className="absolute bottom-16 left-0 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-3 w-72 max-h-64 overflow-y-auto grid grid-cols-8 gap-2">
      <div className="col-span-8 flex justify-between items-center mb-2">
        <span className="font-semibold text-sm text-gray-700 dark:text-gray-200">Chọn emoji</span>
        <button onClick={onClose} className="text-gray-400 hover:text-red-500">✕</button>
      </div>
      {EMOJIS.map((emoji, idx) => (
        <button
          key={idx}
          className="text-2xl hover:scale-125 transition-transform"
          onClick={() => onSelect(emoji)}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
