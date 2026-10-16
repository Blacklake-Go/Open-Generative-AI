'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  PromptComposer,
  PromptTextarea,
  PromptFooter,
  PromptControls,
  PromptAction,
  promptControlClassName,
  promptMediaButtonClassName,
  PromptChevronIcon,
  PromptAspectRatioIcon,
} from '@/packages/studio/src/components/prompt/PromptComposer';

export default function DesignSystemGallery() {
  const [prompt, setPrompt] = useState('A cinematic portrait of an AI creator in a minimal technical studio, soft directional lighting, 8k');
  const [selectedRatio, setSelectedRatio] = useState('16:9');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <div className="min-h-screen bg-canvas text-gray-100 p-6 md:p-12 space-y-16 custom-scrollbar selection:bg-cyan-500/30 selection:text-white">
      {/* Header */}
      <header className="border-b border-white/[0.08] pb-8 space-y-3">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full bg-cyan-400" />
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
            SupDance Design System
          </h1>
          <Badge variant="accent">v2.0 Premium</Badge>
        </div>
        <p className="text-gray-400 text-sm max-w-2xl leading-relaxed">
          Design Direction: <strong className="text-gray-200">“Premium AI Creative Workspace”</strong>. Professional, Cinematic, Minimal, Dense but breathable, Quiet, Technical, Creator-first, Dark-first.
        </p>
      </header>

      {/* 1. Color Palette Tokens */}
      <section className="space-y-6">
        <h2 className="text-lg font-semibold text-white tracking-tight flex items-center gap-2">
          <span>01. Semantic Color Tokens</span>
        </h2>
        
        {/* Surface Levels */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Surface Elevation Levels</h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { name: 'Canvas', token: '--bg-canvas', hex: '#07080b', class: 'bg-canvas border border-white/[0.12]' },
              { name: 'Base', token: '--bg-base', hex: '#0c0e14', class: 'bg-base border border-white/[0.10]' },
              { name: 'Surface', token: '--bg-surface', hex: '#12151e', class: 'bg-surface border border-white/[0.10]' },
              { name: 'Raised', token: '--bg-surface-raised', hex: '#181d2a', class: 'bg-surface-raised border border-white/[0.10]' },
              { name: 'Overlay', token: '--bg-overlay', hex: '#1f2536', class: 'bg-surface-overlay border border-white/[0.12]' },
            ].map((item) => (
              <div key={item.name} className={`p-4 rounded-xl ${item.class} flex flex-col justify-between h-24`}>
                <span className="text-xs font-semibold text-white">{item.name}</span>
                <div className="text-[11px] text-gray-400 font-mono">
                  <span>{item.hex}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Brand & Feedback */}
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Brand & Feedback</h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { name: 'Accent Primary', hex: '#e11d74', class: 'bg-brand text-white' },
              { name: 'Success', hex: '#10b981', class: 'bg-emerald-500 text-black' },
              { name: 'Warning', hex: '#f59e0b', class: 'bg-amber-500 text-black' },
              { name: 'Danger', hex: '#ef4444', class: 'bg-red-500 text-white' },
              { name: 'Info', hex: '#3b82f6', class: 'bg-blue-500 text-white' },
            ].map((item) => (
              <div key={item.name} className={`p-4 rounded-xl ${item.class} flex flex-col justify-between h-20 shadow-sm font-medium`}>
                <span className="text-xs">{item.name}</span>
                <span className="text-[11px] font-mono">{item.hex}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 2. Button Primitive Family */}
      <section className="space-y-6">
        <h2 className="text-lg font-semibold text-white tracking-tight">
          02. Button Primitive Family
        </h2>
        
        <div className="p-6 rounded-xl bg-surface border border-white/[0.08] space-y-6">
          {/* Variants */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Variants</h3>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary">Primary Action</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
            </div>
          </div>

          {/* Sizes */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Height Contracts (sm: 32px, md: 38px, lg: 44px)</h3>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" size="sm">Small (32px)</Button>
              <Button variant="secondary" size="md">Medium (38px)</Button>
              <Button variant="secondary" size="lg">Large (44px)</Button>
              <Button variant="secondary" size="icon-sm" aria-label="Settings">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              </Button>
              <Button variant="secondary" size="icon-md" aria-label="Settings">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              </Button>
            </div>
          </div>

          {/* Interactive States */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">States (Loading, Disabled)</h3>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" loading>Generating...</Button>
              <Button variant="secondary" loading>Processing...</Button>
              <Button variant="primary" disabled>Disabled Primary</Button>
              <Button variant="secondary" disabled>Disabled Secondary</Button>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Input & Select Family */}
      <section className="space-y-6">
        <h2 className="text-lg font-semibold text-white tracking-tight">
          03. Inputs & Select Controls
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-6 rounded-xl bg-surface border border-white/[0.08] space-y-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Text Inputs</h3>
            <Input placeholder="Standard Input (38px)..." />
            <Input placeholder="Small Input (32px)..." size="sm" />
            <Input placeholder="Error State Input..." error defaultValue="Invalid API Token" />
            <Input placeholder="Disabled Input..." disabled defaultValue="Disabled by system" />
          </div>

          <div className="p-6 rounded-xl bg-surface border border-white/[0.08] space-y-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Select & Dropdown</h3>
            <Select defaultValue="flux-pro">
              <SelectTrigger>
                <SelectValue placeholder="Select Model" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="flux-pro">FLUX.1 Pro Ultra</SelectItem>
                <SelectItem value="flux-dev">FLUX.1 Dev</SelectItem>
                <SelectItem value="sd-35">Stable Diffusion 3.5 Large</SelectItem>
                <SelectItem value="recraft">Recraft V3 Vector</SelectItem>
              </SelectContent>
            </Select>

            <Textarea placeholder="Multi-line Prompt or script textarea with quiet custom scrollbar..." rows={3} />
          </div>
        </div>
      </section>

      {/* 4. Badges & Cards */}
      <section className="space-y-6">
        <h2 className="text-lg font-semibold text-white tracking-tight">
          04. Badges & Card System
        </h2>

        <div className="p-6 rounded-xl bg-surface border border-white/[0.08] space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default">Default</Badge>
            <Badge variant="accent">Generating</Badge>
            <Badge variant="success">Completed</Badge>
            <Badge variant="warning">Queued</Badge>
            <Badge variant="danger">Failed</Badge>
            <Badge variant="info">Syncing</Badge>
            <Badge variant="outline">Outline Pill</Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Base Studio Card</CardTitle>
                <CardDescription>Default surface elevation for parameters</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Quiet borders, zero noisy glow. Ensures AI artwork remains the sole hero.
                </p>
              </CardContent>
            </Card>

            <Card interactive>
              <CardHeader>
                <CardTitle>Interactive Model Card</CardTitle>
                <CardDescription>Subtle hover brightness elevation</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Hovering elevates surface-raised background and sharpens border contrast.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Modal Primitive</CardTitle>
                <CardDescription>Standard Dialog / Drawer</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="secondary" size="sm" onClick={() => setIsDialogOpen(true)}>
                  Open Standard Dialog
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* 5. Prompt Composer Standard Component */}
      <section className="space-y-6">
        <h2 className="text-lg font-semibold text-white tracking-tight">
          05. Prompt Composer (Tier-1 Core Component)
        </h2>

        <div className="relative min-h-[300px] rounded-2xl bg-base border border-white/[0.08] p-6 flex flex-col justify-end items-center overflow-hidden">
          <div className="text-center text-gray-500 text-xs mb-8">
            Canvas Workspace Preview — Prompt Composer Anchored at Bottom
          </div>

          {/* Inline Prompt Composer Demonstration */}
          <div className="w-full max-w-3xl">
            <PromptComposer positionClassName="relative w-full">
              <PromptTextarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe your creation prompt..."
              />
              <PromptFooter>
                <PromptControls>
                  <button type="button" className={promptControlClassName({ active: false })}>
                    <PromptAspectRatioIcon />
                    <span>{selectedRatio}</span>
                    <PromptChevronIcon />
                  </button>

                  <button type="button" className={promptControlClassName({ active: true })}>
                    <span>FLUX.1 Pro</span>
                    <PromptChevronIcon />
                  </button>

                  <button type="button" className={promptMediaButtonClassName({ active: false })} aria-label="Upload Reference Image">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  </button>
                </PromptControls>

                <PromptAction>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  <span>Generate</span>
                </PromptAction>
              </PromptFooter>
            </PromptComposer>
          </div>
        </div>
      </section>

      {/* Standard Dialog Test */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Standard Workspace Modal</DialogTitle>
            <DialogDescription>
              This dialog inherits Design Tokens (--bg-overlay, radius-xl, border-strong).
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 text-sm text-gray-300">
            Esc closes the dialog. Tab navigation is trapped naturally within the modal container.
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => setIsDialogOpen(false)}>Confirm Action</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
