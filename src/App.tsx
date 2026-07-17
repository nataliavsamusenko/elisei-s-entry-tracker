import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import Dynamics from "./pages/Dynamics.tsx";
import Changes from "./pages/Changes.tsx";
import Confirmations from "./pages/Confirmations.tsx";
import Applicants from "./pages/Applicants.tsx";
import ApplicantProfile from "./pages/ApplicantProfile.tsx";
import NotFound from "./pages/NotFound.tsx";


const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/dynamics" element={<Dynamics />} />
          <Route path="/changes" element={<Changes />} />
          <Route path="/confirmations" element={<Confirmations />} />
          <Route path="/applicants" element={<Applicants />} />
          <Route path="/applicants/:profileKey" element={<ApplicantProfile />} />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
