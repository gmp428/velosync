import { useRef } from 'react'
import { importAll, parseImportFile, type BackupFile } from '../db'

export function ImportFromFile({ className }: { className?: string }) {
  const fileInput = useRef<HTMLInputElement>(null)

  const onFile = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as unknown
      const data: BackupFile = parseImportFile(parsed)
      const dated = data.exportedAt && !Number.isNaN(Date.parse(data.exportedAt))
      const lead = dated
        ? `Replace everything on this device with the file from ${new Date(data.exportedAt).toLocaleString()}?`
        : 'Replace everything on this device with this file?'
      if (!confirm(`${lead}\n\nSeasons, teams, pitchers, games, pitches, earned runs, and person links stored here will be deleted. This does not merge with what you already have.`)) return
      await importAll(data)
      alert('Import finished.')
    } catch (err) {
      alert(`Import failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={() => fileInput.current?.click()}>
        Import from file
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
    </>
  )
}
