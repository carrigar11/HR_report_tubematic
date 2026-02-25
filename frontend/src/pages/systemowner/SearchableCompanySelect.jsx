import { useState, useEffect, useRef } from 'react'

/** Searchable company dropdown: type to filter by name or code. */
export default function SearchableCompanySelect({ companies, value, onChange, placeholder = 'Select company...', required }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const selected = companies.find((c) => c.id === value)
  const displayLabel = selected ? `${selected.name} (${selected.code || ''})` : ''
  const searchLower = (search || '').trim().toLowerCase()
  const filtered = searchLower
    ? companies.filter(
        (c) =>
          (c.name || '').toLowerCase().includes(searchLower) ||
          (c.code || '').toLowerCase().includes(searchLower)
      )
    : companies

  useEffect(() => {
    if (!open) setSearch('')
  }, [open])

  useEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = 0
  }, [open, filtered.length])

  return (
    <div className="searchableSelectWrap">
      <div
        className="searchableSelectTrigger"
        onClick={() => {
          setOpen(!open)
          if (!open) setTimeout(() => inputRef.current?.focus(), 50)
        }}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {open ? (
          <input
            ref={inputRef}
            type="text"
            className="input searchableSelectInput"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false)
              if (e.key === 'ArrowDown' && listRef.current) {
                const first = listRef.current.querySelector('[role="option"]')
                if (first) first.focus()
              }
            }}
            placeholder="Type to search company..."
            autoComplete="off"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className={value ? '' : 'muted'}>{displayLabel || placeholder}</span>
        )}
        <span className="searchableSelectArrow" aria-hidden>▼</span>
      </div>
      {open && (
        <ul
          ref={listRef}
          className="searchableSelectDropdown"
          role="listbox"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false)
          }}
        >
          {filtered.length === 0 ? (
            <li className="searchableSelectEmpty">No company found</li>
          ) : (
            filtered.map((c) => (
              <li
                key={c.id}
                role="option"
                aria-selected={value === c.id}
                className={value === c.id ? 'searchableSelectOption selected' : 'searchableSelectOption'}
                onClick={() => {
                  onChange(c.id)
                  setOpen(false)
                }}
              >
                {c.name} {c.code ? `(${c.code})` : ''}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
