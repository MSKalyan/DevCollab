import React, { useState } from "react";
import { X } from "lucide-react";

export default function TechStackSelector({ selectedTags = [], onChange }) {
  const [input, setInput] = useState("");

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const val = input.trim().toLowerCase();
      if (val && !selectedTags.includes(val)) {
        const newTags = [...selectedTags, val];
        onChange(newTags);
      }
      setInput("");
    }
  };

  const removeTag = (tagToRemove) => {
    const newTags = selectedTags.filter((t) => t !== tagToRemove);
    onChange(newTags);
  };

  return (
    <div className="w-full">
      <label className="field-label">Tech Stack Tags</label>
      <div className="mb-2 flex flex-wrap gap-2">
        {selectedTags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-md bg-merge/10 px-3 py-1 font-mono text-xs font-medium text-merge border border-merge/20 capitalize"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="rounded-full p-0.5 hover:bg-merge/20 hover:text-white transition"
              aria-label={`Remove ${tag} tag`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {selectedTags.length === 0 && (
          <span className="text-xs text-ink-muted italic">No tags added yet.</span>
        )}
      </div>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a technology (e.g. React, Node) and press Enter or Comma"
        className="field"
      />
    </div>
  );
}
