import { openSigned, isImagePath, fileNameFromPath } from '../lib/format'

export type Signed = { path: string; url: string }

export default function DocGrid({ files }: { files: Signed[] }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {files.map(d => (
        <a key={d.path} href={d.url} target="_blank" rel="noreferrer" className="block"
          onClick={e => { e.preventDefault(); void openSigned('kyc-documents', d.path) }}>
          {isImagePath(d.path) ? (
            <img src={d.url} alt="" className="h-24 w-full rounded-lg border border-hair object-cover" />
          ) : (
            <span className="flex h-24 items-center justify-center rounded-lg border border-hair bg-white px-2 text-center font-mono text-[11px] text-petrol underline underline-offset-2">
              {fileNameFromPath(d.path)}
            </span>
          )}
        </a>
      ))}
    </div>
  )
}
