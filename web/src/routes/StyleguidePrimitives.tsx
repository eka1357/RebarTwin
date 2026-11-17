import { useState } from "react";
import {
  Command as CommandIcon,
  MoreHorizontal,
  PanelRight,
  SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover";
import { Progress } from "../components/ui/progress";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../components/ui/resizable";
import { ScrollArea } from "../components/ui/scroll-area";
import { Separator } from "../components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "../components/ui/sheet";
import { Skeleton } from "../components/ui/skeleton";
import { Slider } from "../components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Toggle } from "../components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip";

export function StyleguidePrimitives() {
  const [mode, setMode] = useState("before");
  const [concreteOn, setConcreteOn] = useState(true);
  const [step, setStep] = useState([12]);
  const [cmdOpen, setCmdOpen] = useState(false);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
        <h3 className="mb-3 text-base font-semibold">Buttons &amp; Badges</h3>
        <div className="flex flex-wrap gap-2">
          <Button variant="default">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="paper">Paper</Button>
          <Button variant="outline" size="sm">
            Small
          </Button>
        </div>
        <Separator className="my-4" />
        <div className="flex flex-wrap gap-2">
          <Badge variant="default">Default</Badge>
          <Badge variant="muted">Muted</Badge>
          <Badge variant="fail">Fails</Badge>
          <Badge variant="pass">Passes</Badge>
          <Badge variant="check">To check</Badge>
          <Badge variant="advisory">Recheck</Badge>
          <Badge variant="paper">Paper</Badge>
        </div>
      </section>

      <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
        <h3 className="mb-3 text-base font-semibold">Toggles, Slider &amp; Progress</h3>
        <div className="flex flex-wrap items-center gap-3">
          <ToggleGroup
            type="single"
            value={mode}
            onValueChange={(v) => v && setMode(v)}
            aria-label="Model state"
          >
            <ToggleGroupItem value="before">Before</ToggleGroupItem>
            <ToggleGroupItem value="after">After</ToggleGroupItem>
          </ToggleGroup>
          <Toggle
            pressed={concreteOn}
            onPressedChange={setConcreteOn}
            aria-label="Toggle concrete visibility"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Concrete</span>
          </Toggle>
        </div>
        <div className="mt-4 space-y-3">
          <div>
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>Replay step</span>
              <span className="font-num">{step[0]} / 34</span>
            </div>
            <Slider
              value={step}
              onValueChange={setStep}
              min={1}
              max={34}
              step={1}
              aria-label="Replay step"
            />
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs text-muted-foreground">
              <span>Reading progress</span>
              <span className="font-num">68%</span>
            </div>
            <Progress value={68} aria-label="Reading progress" />
          </div>
        </div>
      </section>

      <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
        <h3 className="mb-3 text-base font-semibold">Overlays &amp; Navigation</h3>
        <div className="flex flex-wrap gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm">
                Tooltip (400 ms)
              </Button>
            </TooltipTrigger>
            <TooltipContent>IS 456 cl. 26.3.2 clear spacing</TooltipContent>
          </Tooltip>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                Clause Popover
              </Button>
            </PopoverTrigger>
            <PopoverContent>
              <p className="font-num text-xs font-medium">IS 456:2000 cl. 26.3.2</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Horizontal clear distance between parallel main bars at least bar diameter and
                aggregate size plus 5 mm.
              </p>
            </PopoverContent>
          </Popover>

          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                Dialog
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Keyboard Shortcuts</DialogTitle>
                <DialogDescription>
                  Viewport controls and navigation shortcuts for the workspace.
                </DialogDescription>
              </DialogHeader>
              <p className="mt-3 text-sm text-muted-foreground">
                Use arrows to orbit, + and - to zoom, F to frame selection, and 0 to reset.
              </p>
            </DialogContent>
          </Dialog>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                <PanelRight className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Sheet</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right">
              <SheetTitle>Joint Inspector</SheetTitle>
              <SheetDescription>Slide-over drawer for narrow viewports.</SheetDescription>
              <p className="text-sm text-muted-foreground">
                Inspect bars, clauses, and drawing crops.
              </p>
            </SheetContent>
          </Sheet>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" aria-label="Export menu">
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                <span>Export</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => toast("Downloaded joint.ifc")}>
                Download IFC
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => toast("Downloaded issues.bcf")}>
                Download BCF
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => toast("Opened report")}>
                Open Report
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="outline" size="sm" onClick={() => setCmdOpen(true)}>
            <CommandIcon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Command (Ctrl+K)</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              toast("Option 1: 2-25 over 2-20", {
                description: "+39 mm², 4 bars instead of 5",
              })
            }
          >
            Trigger Toast
          </Button>
        </div>

        <CommandDialog open={cmdOpen} onOpenChange={setCmdOpen}>
          <CommandInput placeholder="Search joints, findings, bars, clauses..." />
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>
            <CommandGroup heading="Findings">
              <CommandItem onSelect={() => setCmdOpen(false)}>
                <span>IS 456 cl. 26.3.2 — B12 top spacing</span>
                <span className="font-num text-xs text-fail">16 mm</span>
              </CommandItem>
              <CommandItem onSelect={() => setCmdOpen(false)}>
                <span>Geometry — C4/V4 and B12/T1-3</span>
                <span className="font-num text-xs text-fail">18 mm overlap</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </CommandDialog>

        <Tabs defaultValue="findings" className="mt-4">
          <TabsList>
            <TabsTrigger value="findings">Findings</TabsTrigger>
            <TabsTrigger value="fixes">Fix</TabsTrigger>
            <TabsTrigger value="workings">Workings</TabsTrigger>
          </TabsList>
          <TabsContent value="findings" className="text-xs text-muted-foreground">
            Findings panel preview with Radix Tabs.
          </TabsContent>
          <TabsContent value="fixes" className="text-xs text-muted-foreground">
            Fix options panel preview.
          </TabsContent>
          <TabsContent value="workings" className="text-xs text-muted-foreground">
            Workings replay preview.
          </TabsContent>
        </Tabs>
      </section>

      <section className="rounded-[var(--radius-lg)] border border-border bg-surface p-4">
        <h3 className="mb-3 text-base font-semibold">ScrollArea, Skeleton &amp; Resizable</h3>
        <div className="h-28 overflow-hidden rounded-[var(--radius-md)] border border-border">
          <ResizablePanelGroup orientation="horizontal">
            <ResizablePanel defaultSize={55} minSize={30} className="bg-surface-sunken p-2.5">
              <p className="text-xs font-medium text-muted-foreground">Viewport pane</p>
              <Skeleton className="mt-2 h-4 w-3/4" />
              <Skeleton className="mt-1.5 h-4 w-1/2" />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize={45} minSize={25} className="bg-surface p-2.5">
              <ScrollArea className="h-20 pr-2">
                <p className="text-xs text-muted-foreground">
                  Scrollable inspector area with tokenised scrollbar thumb. Line 1: C4 300 × 300.
                  Line 2: B12 230 × 450. Line 3: 5-20 top bars. Line 4: 4-16 bottom bars.
                </p>
              </ScrollArea>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </section>
    </div>
  );
}
