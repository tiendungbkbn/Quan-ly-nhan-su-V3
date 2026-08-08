import { Route, Switch, Router as WouterRouter } from 'wouter';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Shell } from '@/components/layout/Shell';
import { LanguageProvider } from '@/lib/i18n';
import NotFound from '@/pages/not-found';

// We will create these next
import Dashboard from '@/pages/Dashboard';
import Employees from '@/pages/Employees';
import ResignedEmployees from '@/pages/ResignedEmployees';
import EmployeeDetail from '@/pages/EmployeeDetail';
import Templates from '@/pages/Templates';
import ImportEmployees from '@/pages/ImportEmployees';
import CreateEmployee from '@/pages/CreateEmployee';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Shell>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/nhan-vien" component={Employees} />
        <Route path="/nhan-vien/tao-moi" component={CreateEmployee} />
        <Route path="/nhan-vien/:id" component={EmployeeDetail} />
        <Route path="/ho-so" component={Templates} />
        <Route path="/nhap-lieu" component={ImportEmployees} />
        <Route component={NotFound} />
      </Switch>
    </Shell>
  );
}

function App() {
  return (
    <LanguageProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </LanguageProvider>
  );
}

export default App;
