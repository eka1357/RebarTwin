import { Box, Eye, Focus, Maximize2, Minimize2, RotateCcw, Tag } from "lucide-react";
import { Button } from "../../components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
import type { CameraPreset, ConcreteMode, LabelMode } from "../../stores/workspace";

interface ViewportToolbarProps {
  preset: CameraPreset;
  concreteMode: ConcreteMode;
  labelMode: LabelMode;
  isFullscreen: boolean;
  hasSelection: boolean;
  onPresetChange: (preset: CameraPreset) => void;
  onCycleConcrete: () => void;
  onCycleLabels: () => void;
  onFrame: () => void;
  onReset: () => void;
  onToggleFullscreen: () => void;
  onOpenIfc: () => void;
}

export function ViewportToolbar({
  preset,
  concreteMode,
  labelMode,
  isFullscreen,
  hasSelection,
  onPresetChange,
  onCycleConcrete,
  onCycleLabels,
  onFrame,
  onReset,
  onToggleFullscreen,
  onOpenIfc,
}: ViewportToolbarProps) {
  return (
    <div
      role="toolbar"
      aria-label="3D viewport controls"
      className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface px-3 py-1.5"
    >
      <ToggleGroup
        type="single"
        value={preset}
        onValueChange={(v) => {
          if (v) onPresetChange(v as CameraPreset);
        }}
        aria-label="Camera views"
      >
        <ToggleGroupItem value="iso">Iso</ToggleGroupItem>
        <ToggleGroupItem value="plan">Plan</ToggleGroupItem>
        <ToggleGroupItem value="elevation_x">X Elev</ToggleGroupItem>
        <ToggleGroupItem value="elevation_y">Y Elev</ToggleGroupItem>
      </ToggleGroup>

      <div className="flex flex-wrap items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={onCycleConcrete}>
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                Concrete:{" "}
                {concreteMode === "translucent"
                  ? "See-through"
                  : concreteMode === "wireframe"
                    ? "Ghost"
                    : "Hidden"}
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Cycle concrete visibility</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={onCycleLabels}>
              <Tag className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                Labels:{" "}
                {labelMode === "failures" ? "Failures" : labelMode === "all" ? "All" : "Off"}
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Cycle 3D label overlay</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={onFrame}>
              <Focus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{hasSelection ? "Frame (F)" : "Fit (F)"}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Frame selection or joint (F)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={onReset}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Reset</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Reset Iso camera (0)</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={onOpenIfc}>
              <Box className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Open IFC</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Inspect an IFC file via web-ifc</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onClick={onToggleFullscreen}
              aria-label={isFullscreen ? "Exit full screen" : "Full screen viewport"}
            >
              {isFullscreen ? (
                <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isFullscreen ? "Exit full screen" : "Full screen"}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
